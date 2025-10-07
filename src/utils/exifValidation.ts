// EXIF Validation System - Comprehensive metadata analysis
// Implementation of proportional scoring with configurable weights

export interface ValidationResult {
  level: number;           // 0-3 classification level
  label: string;          // Human-readable classification
  score: number;          // Total calculated score
  canonicalCaptureDate: string | null;  // Best capture date with timezone
  make: string | null;    // Camera make
  model: string | null;   // Camera model
  positiveSignals: string[];  // Evidence supporting authenticity
  riskSignals: string[];      // Evidence suggesting manipulation
  recommendation: string;     // Action recommendation based on level
  isDigitalTransport?: boolean;  // Digital transport detection flag
  hasStrongC2PA?: boolean;    // C2PA strong signal (edited + DigitalSourceType AI)
  debugInfo?: any;           // Debug information if enabled
}

export interface ValidationConfig {
  weights: {
    makeAbsent: number;
    modelAbsent: number;
    dateTimeAbsent: number;
    editorDetected: number;
    temporalInconsistency: number;
    dimensionMismatch: number;
    progressiveDCT: number;
    subsampling444: number;
    specificICC: number;
    aiIndicators: number;
    silentEditSignal: number;     // Weight for each silent edit signal
    cameraExifAbsentCombined: number; // Combined penalty when Make+Model+CreateDate missing without hard signals
    impossibleDate: number;       // Penalty when capture date is in the future
  };
  thresholds: {
    level0Max: number;  // 0-1: Low risk
    level1Max: number;  // 2-3: Moderate risk  
    level2Max: number;  // 4-6: High risk
    // ≥7: Very high risk (level 3)
  };
  silentEditMax?: number;         // Cap for silent edit signals (default 2)
  c2paStrongBump?: number;        // Bump for C2PA strong signal (default 0)
}

// Default configuration with balanced weights
export const DEFAULT_CONFIG: ValidationConfig = {
  weights: {
    makeAbsent: 1,
    modelAbsent: 1,
    dateTimeAbsent: 2,
    editorDetected: 3,
    temporalInconsistency: 2,
    dimensionMismatch: 1,
    progressiveDCT: 2,
    subsampling444: 2,
    specificICC: 1,
    aiIndicators: 2,
    silentEditSignal: 1,          // +1 per silent edit signal
    cameraExifAbsentCombined: 1,  // Combined penalty for missing camera EXIF without hard signals
    impossibleDate: 2,            // +2 when capture date >10min in the future
  },
  thresholds: {
    level0Max: 1,
    level1Max: 3,
    level2Max: 6,
  },
  silentEditMax: 2,               // Cap at 2 signals
  c2paStrongBump: 0,              // Disabled by default (can be set to 2)
};

// Known editor software patterns (excluding firmware)
const KNOWN_EDITORS = [
  /adobe photoshop/i,
  /lightroom/i,
  /canva/i,
  /gimp/i,
  /paint\.net/i,
  /photodirector/i,
  /luminar/i,
  /capture one/i,
  /affinity photo/i,
  /pixelmator/i,
  /snapseed/i,
  /vsco/i,
  /instagram/i,
  /facetune/i,
  // Online editors
  /befunky/i,
  /photopea/i,
  /pixlr/i,
  /fotor/i,
  /picsart/i,
  /photoroom/i,
  /remove\.bg/i,
  /iloveimg/i,
  /photoscissors/i,
  /inpaint/i,
  /cleanup\.pictures/i,
  /photolemur/i,
  /topaz/i,
];

// Firmware pattern - typically alphanumeric build strings
const FIRMWARE_PATTERN = /^[A-Z0-9._-]{6,}$/;

/**
 * Parse EXIF date with optional timezone offset
 * @param raw - Date string in EXIF format "2025:09:02 16:57:47"
 * @param offset - Optional timezone offset like "+03:00" or "-05:00"
 * @returns Date object or null if invalid
 */
function parseExifDate(raw?: string, offset?: string): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  
  // Convert "2025:09:02 16:57:47" to "2025-09-02T16:57:47"
  const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})\s+/, '$1-$2-$3T');
  const tz = (offset && /[+-]\d{2}:\d{2}/.test(offset)) ? offset : '';
  const isoString = normalized + tz;
  
  const date = new Date(isoString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get canonical capture date with timezone information
 * Priority: ExifIFD:DateTimeOriginal → ExifIFD:CreateDate → EXIF:DateTimeOriginal → EXIF:CreateDate → IFD0:ModifyDate
 */
export function getCanonicalCaptureDate(exifData: any): string | null {
  const priorities = [
    'ExifIFD:DateTimeOriginal',
    'ExifIFD:CreateDate', 
    'EXIF:DateTimeOriginal',
    'EXIF:CreateDate',
    'IFD0:ModifyDate'
  ];

  for (const field of priorities) {
    const dateValue = exifData[field];
    if (dateValue) {
      // Try to apply timezone offset if available
      const offsetTime = exifData['ExifIFD:OffsetTime'] || 
                        exifData['ExifIFD:OffsetTimeOriginal'] || 
                        exifData['EXIF:OffsetTime'];
      
      if (offsetTime && !dateValue.includes('+') && !dateValue.includes('-')) {
        return `${dateValue}${offsetTime}`;
      }
      return dateValue;
    }
  }

  // Fallback to composite if available
  return exifData['Composite:SubSecDateTimeOriginal'] || null;
}

/**
 * Enhanced date detection covering all namespaces
 */
export function hasAnyCreateDate(exifData: any): boolean {
  const dateFields = [
    'EXIF:DateTime', 'EXIF:DateTimeOriginal', 'EXIF:CreateDate',
    'ExifIFD:DateTime', 'ExifIFD:DateTimeOriginal', 'ExifIFD:CreateDate',
    'IFD0:DateTime', 'IFD0:ModifyDate',
    'XMP:CreateDate', 'XMP:ModifyDate', 'XMP-exif:DateTimeOriginal', 'XMP-photoshop:DateCreated',
    'Composite:SubSecDateTimeOriginal'
  ];

  return dateFields.some(field => exifData[field]);
}

/**
 * Detect real editor software with progressive fallback:
 * 1. Canonical fields (Software, CreatorTool)
 * 2. XMP-photoshop namespace
 * 3. Extended search in specific metadata fields (not URLs/comments)
 */
export function detectRealEditor(exifData: any): { 
  isEditor: boolean; 
  software: string | null; 
  confidence: 'high' | 'medium' | 'low';
  source?: string;
} {
  const looksLikeFirmware = (s: string) => /^[A-Z0-9._-]{6,}$/i.test(s);
  
  // 1. Check canonical fields first
  const softwareFields = ['EXIF:Software', 'IFD0:Software', 'XMP:CreatorTool'];
  for (const field of softwareFields) {
    const software = exifData[field];
    if (software && !looksLikeFirmware(software)) {
      for (const editorPattern of KNOWN_EDITORS) {
        if (editorPattern.test(software)) {
          return { isEditor: true, software, confidence: 'high', source: 'canonical' };
        }
      }
      if (/edit|process|enhance|filter|adjust/i.test(software)) {
        return { isEditor: true, software, confidence: 'medium', source: 'canonical' };
      }
    }
  }

  // 2. Check XMP-photoshop namespace
  const xmpPhotoshopFields = Object.keys(exifData).filter(key => 
    key.startsWith('XMP-photoshop:') && !key.includes('DateCreated')
  );
  if (xmpPhotoshopFields.length > 0) {
    return { isEditor: true, software: 'Adobe Photoshop (XMP)', confidence: 'high', source: 'xmp-photoshop' };
  }

  // 2b. Photoshop group signatures (APP13/IRB)
  // These are specific to Photoshop save/export process (high confidence)
  const psQuality = exifData['Photoshop:PhotoshopQuality'];
  const psFormat  = exifData['Photoshop:PhotoshopFormat'];
  const psScans   = exifData['Photoshop:ProgressiveScans'];

  if (psQuality || psFormat || psScans) {
    const parts: string[] = [];
    if (psQuality) parts.push(`Quality=${psQuality}`);
    if (psFormat)  parts.push(`Format=${psFormat}`);
    if (psScans)   parts.push(`Scans=${psScans}`);
    return {
      isEditor: true,
      software: `Adobe Photoshop (${parts.join(', ')})`,
      confidence: 'high',
      source: 'photoshop-group'
    };
  }

  // 3. Extended search in specific metadata fields (not all values to avoid false positives)
  const extendedSearchFields = [
    'XMP:Creator', 'XMP:Rights', 'XMP:Description',
    'IPTC:ObjectName', 'IPTC:Caption-Abstract',
    'EXIF:ImageDescription', 'EXIF:UserComment',
    'xmpMM:History', 'xmpMM:DerivedFrom', 'XMP-photoshop:History',
  ];
  
  for (const field of extendedSearchFields) {
    const value = exifData[field];
    if (value && typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      // Skip URLs and paths
      if (lowerValue.includes('http') || lowerValue.includes('://') || lowerValue.includes('\\')) {
        continue;
      }
      for (const editorPattern of KNOWN_EDITORS) {
        if (editorPattern.test(value)) {
          return { isEditor: true, software: value, confidence: 'medium', source: `extended:${field}` };
        }
      }
    }
  }

  return { isEditor: false, software: null, confidence: 'low' };
}

/**
 * Detect weak signals of silent editing (editors that preserve EXIF)
 * Each signal adds a light penalty (+1) - multiple signals accumulate
 */
export function detectSilentEditSignals(exifData: any): { 
  count: number; 
  reasons: string[] 
} {
  const reasons: string[] = [];

  // Detectar smartphone pela marca OU modelo
  const brandOrModel = String(
    exifData['IFD0:Make']   || exifData['EXIF:Make']   ||
    exifData['IFD0:Model']  || exifData['EXIF:Model']  || ''
  ).toLowerCase();

  const isSmartphoneBrand = /\b(samsung|apple|iphone|google|pixel|motorola|xiaomi|redmi|huawei|oneplus|oppo|vivo|realme|asus)\b/i
    .test(brandOrModel);

  // Checar tipo do arquivo para o caso do IFD1
  const fileType = String(exifData['File:FileType'] || '').toLowerCase();
  const isJPEG = fileType === 'jpeg' || /jpe?g/.test(String(exifData['File:FileTypeExtension'] || ''));

  // Signal 1: SceneType is not "Directly photographed"
  const sceneType = String(
    exifData['ExifIFD:SceneType'] || exifData['EXIF:SceneType'] || ''
  );
  if (sceneType && !/directly photographed/i.test(sceneType)) {
    reasons.push(`SceneType não é "Directly photographed" (${sceneType})`);
  }

  // Signal 2: ComponentsConfiguration anomaly (ExifTool error parsing)
  // Ignorar em smartphones (comum/benigno)
  if (!isSmartphoneBrand) {
    const components = String(
      exifData['ExifIFD:ComponentsConfiguration'] || exifData['EXIF:ComponentsConfiguration'] || ''
    );
    if (/(?:^|,)\s*err\s*\(63\)|\bundef\b/i.test(components)) {
      if (!reasons.includes(`ComponentsConfiguration anômalo (${components})`)) {
        reasons.push(`ComponentsConfiguration anômalo (${components})`);
      }
    }
  }

  // Signal 3: MakerNote absent despite Make/Model present (only for brands that usually have it)
  const hasMake = !!(exifData['IFD0:Make'] || exifData['EXIF:Make']);
  const hasModel = !!(exifData['IFD0:Model'] || exifData['EXIF:Model']);
  const hasMakerNote = !!(
    exifData['ExifIFD:MakerNote'] || exifData['EXIF:MakerNote'] || 
    Object.keys(exifData).some(k => k.startsWith('MakerNote:'))
  );
  
  if (hasMake && hasModel && !hasMakerNote) {
    const make = String(exifData['IFD0:Make'] || exifData['EXIF:Make'] || '').toLowerCase();
    const brandsWithMakerNote = ['canon', 'nikon', 'sony', 'fujifilm', 'panasonic', 'olympus'];
    if (brandsWithMakerNote.some(brand => make.includes(brand))) {
      reasons.push(`MakerNote ausente apesar de Make/Model (${make})`);
    }
  }

  // Signal 4: EXIF thumbnail absent
  // Ignorar em smartphones e apenas para JPEG (comum/benigno)
  if (!isSmartphoneBrand && isJPEG) {
    const hasThumb = !!(
      exifData['IFD1:ImageWidth'] ||
      exifData['Thumbnail:ImageWidth'] ||
      exifData['IFD1:ThumbnailImage']
    );

    const hasMake  = !!(exifData['IFD0:Make']  || exifData['EXIF:Make']);
    const hasModel = !!(exifData['IFD0:Model'] || exifData['EXIF:Model']);

    if (hasMake && hasModel && !hasThumb) {
      if (!reasons.includes('Thumbnail EXIF (IFD1) ausente')) {
        reasons.push('Thumbnail EXIF (IFD1) ausente');
      }
    }
  }

  return { count: reasons.length, reasons };
}


/**
 * Check for AI generation indicators from XMP IPTC and C2PA/JUMBF/CBOR
 */
export function detectAIIndicators(exifData: any): { 
  hasAI: boolean; 
  indicators: string[];
  hasStrongC2PA: boolean;
} {
  const indicators: string[] = [];
  let hasStrongC2PA = false;
  
  // === C2PA/JUMBF/CBOR Detection (Samsung native AI) ===
  
  const jumbfType = String(exifData['JUMBF:JUMDType'] || '');
  const jumbfLabel = String(exifData['JUMBF:JUMDLabel'] || '');
  const hasC2PAManifest = /c2pa/i.test(jumbfType + ' ' + jumbfLabel);
  
  if (hasC2PAManifest) {
    indicators.push('C2PA manifest presente (JUMBF)');
  }

  // Mandatory Adjustment 1: Strong bump only with c2pa.edited + DigitalSourceType AI
  const action = String(exifData['CBOR:ActionsAction'] || '').toLowerCase();
  const actionEdited = /c2pa\.edited/.test(action);
  if (action && action.includes('c2pa')) {
    indicators.push(`C2PA action: ${action}`);
  }

  const agent = String(exifData['CBOR:ActionsSoftwareAgent'] || '').trim();
  if (agent) {
    indicators.push(`C2PA agent: ${agent}`);
  }

  const dsrcCBOR = String(exifData['CBOR:ActionsDigitalSourceType'] || '').toLowerCase();
  const dsrcAI = /compositewithtrainedalgorithmicmedia|generatedbycomputeralgorithmicmedia/i.test(dsrcCBOR);
  if (dsrcCBOR && dsrcAI) {
    indicators.push(`C2PA DigitalSourceType: ${dsrcCBOR}`);
  }

  // Strong signal only if BOTH present
  hasStrongC2PA = actionEdited && dsrcAI;

  const genAI = String(exifData['JSON:GenAIType'] || '').trim();
  if (genAI === '1' || genAI === 'true') {
    indicators.push('GenAIType flag ativada');
  }

  // === XMP IPTC Detection (existing logic) ===
  
  const aiFields = ['XMP-iptcExt:DigitalSourceType', 'XMP-iptcExt:DigitalSourceFileType'];
  for (const field of aiFields) {
    const value = exifData[field];
    if (value && /compositeWithTrainedAlgorithmicMedia|artificiallyGenerated/i.test(value)) {
      indicators.push(`AI indicator in ${field}: ${value}`);
    }
  }

  // Mandatory Adjustment 2: Restrictive regex (closed list, word-boundary)
  const AI_SOFTWARE_RE = /\b(midjourney|dall[\s-]?e|stable\s+diffusion|leonardo\.ai|firefly)\b/i;
  const creatorFields = ['XMP:CreatorTool', 'XMP-photoshop:CreatorTool'];
  for (const field of creatorFields) {
    const value = exifData[field];
    if (value && AI_SOFTWARE_RE.test(value)) {
      indicators.push(`AI software detected in ${field}: ${value}`);
    }
  }

  return { hasAI: indicators.length > 0, indicators, hasStrongC2PA };
}

/**
 * Check dimension consistency between EXIF and File data
 */
export function checkDimensionConsistency(exifData: any): { consistent: boolean; details: string; hasData: boolean } {
  const exifWidth = parseInt(exifData['EXIF:ImageWidth'] || exifData['ExifIFD:ExifImageWidth'] || '0');
  const exifHeight = parseInt(exifData['EXIF:ImageHeight'] || exifData['ExifIFD:ExifImageHeight'] || '0');
  const fileWidth = parseInt(exifData['File:ImageWidth'] || '0');
  const fileHeight = parseInt(exifData['File:ImageHeight'] || '0');

  const hasData = exifWidth > 0 && exifHeight > 0 && fileWidth > 0 && fileHeight > 0;

  if (hasData) {
    if (exifWidth !== fileWidth || exifHeight !== fileHeight) {
      return {
        consistent: false,
        details: `Inconsistência de dimensões: EXIF ${exifWidth}x${exifHeight} vs Arquivo ${fileWidth}x${fileHeight}`,
        hasData: true
      };
    }
    return { consistent: true, details: 'Dimensões consistentes', hasData: true };
  }

  return { consistent: true, details: 'Dados de dimensão não disponíveis', hasData: false };
}

/**
 * Check temporal consistency between dates
 */
export function checkTemporalConsistency(exifData: any): { consistent: boolean; details: string; hasData: boolean } {
  const dateTimeOriginal = exifData['ExifIFD:DateTimeOriginal'] || exifData['EXIF:DateTimeOriginal'];
  const offsetOriginal = exifData['ExifIFD:OffsetTimeOriginal'] || 
                        exifData['EXIF:OffsetTimeOriginal'] ||
                        exifData['ExifIFD:OffsetTime'] || 
                        exifData['EXIF:OffsetTime'];
  
  const modifyDate = exifData['IFD0:ModifyDate'] || exifData['EXIF:DateTime'];

  const originalTime = parseExifDate(dateTimeOriginal, offsetOriginal);
  const modifiedTime = parseExifDate(modifyDate, undefined);

  if (originalTime && modifiedTime && modifiedTime < originalTime) {
    return {
      consistent: false,
      details: `Inconsistência temporal: ModifyDate (${modifyDate}) anterior a DateTimeOriginal (${dateTimeOriginal})`,
      hasData: true
    };
  }
  
  if (originalTime || modifiedTime) {
    return { consistent: true, details: 'Consistência temporal verificada', hasData: true };
  }

  return { consistent: true, details: 'Dados temporais não disponíveis', hasData: false };
}

/**
 * Detect digital transport (messenger apps) with conservative heuristic
 * Requires ≥3 signals to trigger
 */
export function detectDigitalTransport(exif: Record<string, any>) {
  const get = (k: string) => exif?.[k];

  // 1) Ausência de EXIF de câmera
  const hasMake  = !!get('IFD0:Make');
  const hasModel = !!get('IFD0:Model');
  const DATE_FIELDS = [
    'EXIF:DateTime','EXIF:DateTimeOriginal','EXIF:CreateDate',
    'ExifIFD:DateTime','ExifIFD:DateTimeOriginal','ExifIFD:CreateDate',
    'IFD0:DateTime','IFD0:ModifyDate',
    'XMP:CreateDate','XMP:ModifyDate','XMP-exif:DateTimeOriginal','XMP-photoshop:DateCreated'
  ];
  const hasAnyDate = DATE_FIELDS.some(k => !!get(k));

  // 2) Sinais típicos de mensageiros
  const isJPEG = String(get('File:FileType') || '').toLowerCase() === 'jpeg';
  const jfif   = !!get('JFIF:JFIFVersion');
  const sub420 = /4:2:0/.test(String(get('File:YCbCrSubSampling') || ''));

  const w = parseInt(get('File:ImageWidth')  || '0', 10);
  const h = parseInt(get('File:ImageHeight') || '0', 10);
  const longSide = Math.max(w, h);
  const longSideIsMessenger =
    (longSide >= 1580 && longSide <= 1620) || [2048, 1280, 960].includes(longSide);

  const iccDesc      = String(get('ICC_Profile:ProfileDescription')  || '');
  const iccCopyright = String(get('ICC_Profile:ProfileCopyright')    || '');
  const iccGoogle    = /srgb/i.test(iccDesc) && /google/i.test(iccCopyright);

  // Votação conservadora: precisa de ≥3 sinais
  const votes = [
    isJPEG && !hasMake && !hasModel && !hasAnyDate,
    isJPEG && jfif && sub420,
    longSideIsMessenger,
    iccGoogle
  ].filter(Boolean).length;

  const isDigitalTransport = votes >= 3;

  const reasons: string[] = [];
  if (isJPEG && !hasMake && !hasModel && !hasAnyDate) reasons.push('Sem EXIF de câmera (Make/Model/Date)');
  if (isJPEG && jfif && sub420)                      reasons.push('JPEG + JFIF + 4:2:0');
  if (longSideIsMessenger)                           reasons.push(`Lado maior ${longSide}px típico de mensageiro`);
  if (iccGoogle)                                     reasons.push('Perfil ICC sRGB (Google)');

  return { isDigitalTransport, reasons };
}

/**
 * Main validation function implementing proportional scoring
 */
export function validateImageMetadata(exifData: any, config: ValidationConfig = DEFAULT_CONFIG): ValidationResult {
  const debugEnabled = import.meta.env.VITE_DEBUG_EXIF === 'true';
  const debugInfo: any = {};
  
  let score = 0;
  const positiveSignals: string[] = [];
  const riskSignals: string[] = [];

  // Get basic info
  const make = exifData['EXIF:Make'] || exifData['IFD0:Make'] || null;
  const model = exifData['EXIF:Model'] || exifData['IFD0:Model'] || null;
  const canonicalCaptureDate = getCanonicalCaptureDate(exifData);

  if (debugEnabled) {
    debugInfo.basicInfo = { make, model, canonicalCaptureDate };
  }

  // 1. Check for missing critical EXIF data with combined penalty
  const hasMake = !!make;
  const hasModel = !!model;
  const hasCreateDate = hasAnyCreateDate(exifData);

  // Detect editor and AI early for combined penalty logic
  const editorResult = detectRealEditor(exifData);
  const aiResult = detectAIIndicators(exifData);

  // Detect hard signals for combined penalty
  const photoshopGroupDetected = !!(
    exifData['Photoshop:PhotoshopQuality'] ||
    exifData['Photoshop:PhotoshopFormat'] ||
    exifData['Photoshop:ProgressiveScans']
  );
  const isProgressiveJPEG = String(exifData['File:EncodingProcess'] || '')
    .toLowerCase()
    .includes('progressive');
  const isSubsampling444 = /4:4:4/.test(String(exifData['File:YCbCrSubSampling'] || ''));

  const cameraExifMissing = !hasMake && !hasModel && !hasCreateDate;
  const hasHardSignals = 
    editorResult.isEditor ||
    aiResult.hasAI ||
    photoshopGroupDetected ||
    isProgressiveJPEG ||
    isSubsampling444;

  // Apply combined penalty if all camera EXIF missing and no hard signals
  if (cameraExifMissing && !hasHardSignals) {
    const w = config.weights.cameraExifAbsentCombined ?? 1;
    score += w;
    riskSignals.push(`EXIF de câmera ausente (Make/Model/Data) (+${w})`);
  } else {
    // Otherwise apply individual penalties
    if (!hasMake) {
      score += config.weights.makeAbsent;
      riskSignals.push(`Marca da câmera ausente (+${config.weights.makeAbsent})`);
    } else {
      positiveSignals.push(`Marca da câmera presente: ${make}`);
    }

    if (!hasModel) {
      score += config.weights.modelAbsent;
      riskSignals.push(`Modelo da câmera ausente (+${config.weights.modelAbsent})`);
    } else {
      positiveSignals.push(`Modelo da câmera presente: ${model}`);
    }

    if (!hasCreateDate) {
      score += config.weights.dateTimeAbsent;
      riskSignals.push(`📅 Data de criação ausente (+${config.weights.dateTimeAbsent})`);
    } else if (canonicalCaptureDate) {
      positiveSignals.push(`📅 Data de criação presente: ${canonicalCaptureDate}`);
    }
  }

  // 2. Editor detection (now with fallback)
  if (editorResult.isEditor) {
    score += config.weights.editorDetected;
    const source = editorResult.source ? ` [${editorResult.source}]` : '';
    riskSignals.push(`Software de edição detectado: ${editorResult.software}${source} (+${config.weights.editorDetected})`);
  } else {
    positiveSignals.push('Nenhum software de edição declarado');
  }

  // 2.5. Silent edit signals (feature toggle + cap)
  const silentEditEnabled = import.meta.env.VITE_FEATURE_SILENT_EDIT !== 'false';
  if (silentEditEnabled && !editorResult.isEditor) {
    const silentEdit = detectSilentEditSignals(exifData);
    if (silentEdit.count > 0) {
      const maxSilent = config.silentEditMax ?? 2;
      const applied = Math.min(silentEdit.count, maxSilent);
      score += applied * config.weights.silentEditSignal;
      for (let i = 0; i < applied; i++) {
        riskSignals.push(`Indício de edição silenciosa: ${silentEdit.reasons[i]} (+${config.weights.silentEditSignal})`);
      }
      if (debugEnabled && silentEdit.count > maxSilent) {
        debugInfo.silentEditCapped = `${silentEdit.count - maxSilent} sinais não aplicados (cap=${maxSilent})`;
      }
    }
  }

  // 3. AI indicators (now includes C2PA) - already detected above
  if (aiResult.hasAI) {
    score += config.weights.aiIndicators;
    for (const indicator of aiResult.indicators) {
      riskSignals.push(`${indicator} (+${config.weights.aiIndicators})`);
    }
    
    // Mandatory Adjustment 1: Strong bump only with edited + DigitalSourceType AI
    if (aiResult.hasStrongC2PA && (config.c2paStrongBump ?? 0) > 0) {
      score += config.c2paStrongBump!;
      riskSignals.push(`Sinal C2PA forte de IA (+${config.c2paStrongBump})`);
    }
  }

  // 4. Technical consistencies
  const dimensionCheck = checkDimensionConsistency(exifData);
  if (!dimensionCheck.consistent) {
    score += config.weights.dimensionMismatch;
    riskSignals.push(`${dimensionCheck.details} (+${config.weights.dimensionMismatch})`);
  } else if (dimensionCheck.hasData) {
    positiveSignals.push(dimensionCheck.details);
  }

  const temporalCheck = checkTemporalConsistency(exifData);
  if (!temporalCheck.consistent) {
    score += config.weights.temporalInconsistency;
    riskSignals.push(`📅 ${temporalCheck.details} (+${config.weights.temporalInconsistency})`);
  } else if (temporalCheck.hasData) {
    positiveSignals.push(`📅 ${temporalCheck.details}`);
  }

  // Check for impossible dates (future)
  try {
    const dto = exifData['ExifIFD:DateTimeOriginal'] || exifData['EXIF:DateTimeOriginal'];
    const dtoOffset = exifData['ExifIFD:OffsetTimeOriginal'] || 
                     exifData['EXIF:OffsetTimeOriginal'] ||
                     exifData['ExifIFD:OffsetTime'] || 
                     exifData['EXIF:OffsetTime'];
    
    const captureDate = parseExifDate(dto, dtoOffset);
    
    if (captureDate) {
      const now = new Date();
      const diffMs = captureDate.getTime() - now.getTime();
      
      // More than 10 minutes in the future
      if (diffMs > 10 * 60 * 1000) {
        score += config.weights.impossibleDate;
        riskSignals.push(`📅 Data de captura no futuro: ${dto} (+${config.weights.impossibleDate})`);
      }
    }
  } catch (e) {
    // Silently ignore parsing errors
  }

  // 5. Technical indicators
  if (exifData['File:EncodingProcess']?.includes('Progressive')) {
    score += config.weights.progressiveDCT;
    riskSignals.push(`Codificação JPEG progressiva (+${config.weights.progressiveDCT})`);
  }

  if (exifData['File:YCbCrSubSampling']?.includes('4:4:4')) {
    score += config.weights.subsampling444;
    riskSignals.push(`Subamostragem YCbCr 4:4:4 incomum (+${config.weights.subsampling444})`);
  }

  const iccProfile = exifData['ICC_Profile:ProfileDescription'];
  if (iccProfile && !['sRGB', 'Adobe RGB', 'ProPhoto RGB', 'Display P3', 'DCI-P3 D65 Gamut with sRGB Transfer'].includes(iccProfile)) {
    score += config.weights.specificICC;
    riskSignals.push(`Perfil ICC específico: ${iccProfile} (+${config.weights.specificICC})`);
  }

  if (debugEnabled) {
    debugInfo.scoring = { score, positiveSignals, riskSignals };
  }

  // Determine classification level
  let level: number;
  let label: string;
  let recommendation: string;

  if (score <= config.thresholds.level0Max) {
    level = 0;
    label = 'Baixo';
    recommendation = 'Imagem apresenta características consistentes com captura original';
  } else if (score <= config.thresholds.level1Max) {
    level = 1;
    label = 'Moderado';
    recommendation = 'Verificar sinais de manipulação identificados';
  } else if (score <= config.thresholds.level2Max) {
    level = 2;
    label = 'Forte';
    recommendation = 'Análise técnica adicional recomendada - múltiplos indicadores de alteração';
  } else {
    level = 3;
    label = 'Muito Forte';
    recommendation = 'Alta probabilidade de manipulação - investigação forense recomendada';
  }

  // Digital transport detection (feature toggle)
  const digitalTransportEnabled = import.meta.env.VITE_FEATURE_DIGITAL_TRANSPORT !== 'false';
  const dt = digitalTransportEnabled ? detectDigitalTransport(exifData) : { isDigitalTransport: false, reasons: [] };
  
  // Refinement 4: Deduplicate signals
  const uniqueRiskSignals = Array.from(new Set([
    ...riskSignals,
    ...(dt.isDigitalTransport ? dt.reasons.map(r => `Transporte digital: ${r}`) : [])
  ]));
  const uniquePositiveSignals = Array.from(new Set(positiveSignals));

  return {
    level,
    label,
    score,
    canonicalCaptureDate,
    make,
    model,
    positiveSignals: uniquePositiveSignals,
    riskSignals: uniqueRiskSignals,
    recommendation,
    isDigitalTransport: !!dt.isDigitalTransport,
    hasStrongC2PA: aiResult?.hasStrongC2PA || false,
    ...(debugEnabled && { debugInfo })
  };
}