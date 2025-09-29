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
  };
  thresholds: {
    level0Max: number;  // 0-1: Low risk
    level1Max: number;  // 2-3: Moderate risk  
    level2Max: number;  // 4-6: High risk
    // ≥7: Very high risk (level 3)
  };
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
  },
  thresholds: {
    level0Max: 1,
    level1Max: 3,
    level2Max: 6,
  }
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
];

// Firmware pattern - typically alphanumeric build strings
const FIRMWARE_PATTERN = /^[A-Z0-9._-]{6,}$/;

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
 * Detect real editor software, excluding firmware
 */
export function detectRealEditor(exifData: any): { isEditor: boolean; software: string | null; confidence: 'high' | 'medium' | 'low' } {
  const softwareFields = ['EXIF:Software', 'IFD0:Software', 'XMP:CreatorTool'];
  
  for (const field of softwareFields) {
    const software = exifData[field];
    if (software) {
      // Check if it matches known editors
      for (const editorPattern of KNOWN_EDITORS) {
        if (editorPattern.test(software)) {
          return { isEditor: true, software, confidence: 'high' };
        }
      }
      
      // Check if it's likely firmware (exclude from editor detection)
      if (FIRMWARE_PATTERN.test(software)) {
        continue;
      }
      
      // If it contains editing-related keywords but not in known list
      if (/edit|process|enhance|filter|adjust/i.test(software)) {
        return { isEditor: true, software, confidence: 'medium' };
      }
    }
  }

  // Check XMP-photoshop namespace for editing indicators
  const xmpPhotoshopFields = Object.keys(exifData).filter(key => key.startsWith('XMP-photoshop:'));
  if (xmpPhotoshopFields.length > 0) {
    return { isEditor: true, software: 'Adobe Photoshop (XMP)', confidence: 'high' };
  }

  return { isEditor: false, software: null, confidence: 'low' };
}

/**
 * Check for AI generation indicators in XMP data
 */
export function detectAIIndicators(exifData: any): { hasAI: boolean; indicators: string[] } {
  const indicators: string[] = [];
  
  // Check for AI-specific XMP fields
  const aiFields = [
    'XMP-iptcExt:DigitalSourceType',
    'XMP-iptcExt:DigitalSourceFileType'
  ];

  for (const field of aiFields) {
    const value = exifData[field];
    if (value && /compositeWithTrainedAlgorithmicMedia|artificiallyGenerated/i.test(value)) {
      indicators.push(`AI indicator in ${field}: ${value}`);
    }
  }

  // Check for AI-related keywords in software/creator fields
  const creatorFields = ['XMP:CreatorTool', 'XMP-photoshop:CreatorTool'];
  for (const field of creatorFields) {
    const value = exifData[field];
    if (value && /midjourney|dall-e|stable diffusion|ai|artificial|generated/i.test(value)) {
      indicators.push(`AI software detected in ${field}: ${value}`);
    }
  }

  return { hasAI: indicators.length > 0, indicators };
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
        details: `Dimension mismatch: EXIF ${exifWidth}x${exifHeight} vs File ${fileWidth}x${fileHeight}`,
        hasData: true
      };
    }
    return { consistent: true, details: 'Dimensions consistent', hasData: true };
  }

  return { consistent: true, details: 'No dimension data available', hasData: false };
}

/**
 * Check temporal consistency between dates
 */
export function checkTemporalConsistency(exifData: any): { consistent: boolean; details: string; hasData: boolean } {
  const dateTimeOriginal = exifData['ExifIFD:DateTimeOriginal'] || exifData['EXIF:DateTimeOriginal'];
  const modifyDate = exifData['IFD0:ModifyDate'] || exifData['EXIF:DateTime'];

  const hasData = !!(dateTimeOriginal && modifyDate);

  if (hasData) {
    try {
      const originalTime = new Date(dateTimeOriginal);
      const modifiedTime = new Date(modifyDate);
      
      if (modifiedTime < originalTime) {
        return {
          consistent: false,
          details: `Temporal inconsistency: ModifyDate (${modifyDate}) before DateTimeOriginal (${dateTimeOriginal})`,
          hasData: true
        };
      }
      return { consistent: true, details: 'Temporal consistency verified', hasData: true };
    } catch (error) {
      return { consistent: false, details: 'Invalid date format detected', hasData: true };
    }
  }

  return { consistent: true, details: 'No temporal data available', hasData: false };
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

  // 1. Check for missing critical EXIF data
  if (!make) {
    score += config.weights.makeAbsent;
    riskSignals.push(`Missing camera make (+${config.weights.makeAbsent})`);
  } else {
    positiveSignals.push(`Camera make present: ${make}`);
  }

  if (!model) {
    score += config.weights.modelAbsent;
    riskSignals.push(`Missing camera model (+${config.weights.modelAbsent})`);
  } else {
    positiveSignals.push(`Camera model present: ${model}`);
  }

  if (!hasAnyCreateDate(exifData)) {
    score += config.weights.dateTimeAbsent;
    riskSignals.push(`Missing creation date (+${config.weights.dateTimeAbsent})`);
  } else {
    positiveSignals.push(`Creation date present: ${canonicalCaptureDate}`);
  }

  // 2. Editor detection
  const editorResult = detectRealEditor(exifData);
  if (editorResult.isEditor) {
    score += config.weights.editorDetected;
    riskSignals.push(`Editor software detected: ${editorResult.software} (+${config.weights.editorDetected})`);
  } else {
    positiveSignals.push('No editing software detected');
  }

  // 3. AI indicators
  const aiResult = detectAIIndicators(exifData);
  if (aiResult.hasAI) {
    score += config.weights.aiIndicators;
    riskSignals.push(`AI generation indicators: ${aiResult.indicators.join(', ')} (+${config.weights.aiIndicators})`);
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
    riskSignals.push(`${temporalCheck.details} (+${config.weights.temporalInconsistency})`);
  } else if (temporalCheck.hasData) {
    positiveSignals.push(temporalCheck.details);
  }

  // 5. Technical indicators
  if (exifData['File:EncodingProcess']?.includes('Progressive')) {
    score += config.weights.progressiveDCT;
    riskSignals.push(`Progressive JPEG encoding (+${config.weights.progressiveDCT})`);
  }

  if (exifData['File:YCbCrSubSampling']?.includes('4:4:4')) {
    score += config.weights.subsampling444;
    riskSignals.push(`Unusual YCbCr 4:4:4 subsampling (+${config.weights.subsampling444})`);
  }

  const iccProfile = exifData['ICC_Profile:ProfileDescription'];
  if (iccProfile && !['sRGB', 'Adobe RGB', 'ProPhoto RGB'].includes(iccProfile)) {
    score += config.weights.specificICC;
    riskSignals.push(`Specific ICC profile: ${iccProfile} (+${config.weights.specificICC})`);
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
  
  // Remove duplicates from riskSignals
  const uniqueRiskSignals = Array.from(new Set([
    ...riskSignals,
    ...(dt.isDigitalTransport ? dt.reasons.map(r => `Transporte digital: ${r}`) : [])
  ]));

  return {
    level,
    label,
    score,
    canonicalCaptureDate,
    make,
    model,
    positiveSignals,
    riskSignals: uniqueRiskSignals,
    recommendation,
    isDigitalTransport: !!dt.isDigitalTransport,
    ...(debugEnabled && { debugInfo })
  };
}