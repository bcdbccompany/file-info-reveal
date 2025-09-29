import { useState, useMemo } from 'react';
import { 
  Camera, 
  MapPin, 
  Palette, 
  FileText, 
  Download,
  ChevronDown,
  Image as ImageIcon
} from 'lucide-react';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

interface ExifToolMetadataDisplayProps {
  metadata: {
    metadata: any;
    rawExifData: any;
  };
}

export default function ExifToolMetadataDisplay({ metadata }: ExifToolMetadataDisplayProps) {
  const [isLoading] = useState(false);

  const exifData = metadata.rawExifData || {};
  const fileMetadata = metadata.metadata || {};

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Organize metadata by groups based on ExifTool Group:Tag format
  const organizedMetadata = useMemo(() => {
    const groups: Record<string, Record<string, any>> = {
      file: {},
      exif: {},
      gps: {},
      icc: {},
      adobe: {},
      composite: {},
      other: {}
    };

    Object.entries(exifData).forEach(([key, value]) => {
      if (key.startsWith('System:')) return; // Filter out System fields

      const [group, tag] = key.split(':', 2);
      const lowerGroup = group.toLowerCase();

      if (lowerGroup.includes('file')) {
        groups.file[key] = value;
      } else if (lowerGroup.includes('exif')) {
        groups.exif[key] = value;
      } else if (lowerGroup.includes('gps')) {
        groups.gps[key] = value;
      } else if (lowerGroup.includes('icc')) {
        groups.icc[key] = value;
      } else if (lowerGroup.includes('adobe') || lowerGroup.includes('photoshop') || lowerGroup.includes('xmp')) {
        groups.adobe[key] = value;
      } else if (lowerGroup.includes('composite') || lowerGroup.includes('jfif')) {
        groups.composite[key] = value;
      } else {
        groups.other[key] = value;
      }
    });

    return groups;
  }, [exifData]);

  // Detectar se é arquivo original (com EXIF completo de câmera)
  const isOriginalFile = useMemo(() => {
    if (!exifData) return false;
    
    const hasCameraMake = exifData['EXIF:Make'] || exifData['IFD0:Make'];
    const hasCameraModel = exifData['EXIF:Model'] || exifData['IFD0:Model'];
    const hasISO = exifData['EXIF:ISO'] || exifData['EXIF:RecommendedExposureIndex'] || exifData['EXIF:ISOSpeedRatings'];
    const hasExposure = exifData['EXIF:ExposureTime'] || exifData['EXIF:ShutterSpeedValue'];
    const hasAperture = exifData['EXIF:FNumber'] || exifData['EXIF:ApertureValue'];
    
    // Considera original se tem pelo menos Make, Model e mais 2 parâmetros de câmera
    const cameraFields = [hasISO, hasExposure, hasAperture].filter(Boolean).length;
    return hasCameraMake && hasCameraModel && cameraFields >= 2;
  }, [exifData]);

  // Calcular score de manipulação baseado na tabela de validação completa
  const manipulationScore = useMemo(() => {
    if (!exifData) return { score: 0, indicators: [], details: [], isProgressive: false, is444: false, hasHPAdobe: false };

    let score = 0;
    const indicators: string[] = [];
    const details: string[] = [];

    // 1. EXIF crítico ausente (0 pontos - apenas flag) - Detecção para transporte digital
    const hasMake = exifData['EXIF:Make'] || exifData['IFD0:Make'];
    const hasModel = exifData['EXIF:Model'] || exifData['IFD0:Model'];
    const hasISO = exifData['EXIF:ISO'] || exifData['EXIF:RecommendedExposureIndex'] || exifData['EXIF:ISOSpeedRatings'];
    const hasCreateDate = exifData['EXIF:CreateDate'] || exifData['EXIF:DateTimeOriginal'];
    
    const missingEssentialExif = !hasMake || !hasModel || !hasCreateDate;
    
    // Detectar ausência de EXIF (sem pontuação - apenas flag para análise)
    const imageWidth = parseInt(exifData['EXIF:ImageWidth'] || exifData['File:ImageWidth'] || '0');
    const imageHeight = parseInt(exifData['EXIF:ImageHeight'] || exifData['File:ImageHeight'] || '0');
    const isHighQuality = imageWidth >= 800 && imageHeight >= 600; // Imagem de tamanho significativo
    
    console.log('=== DEBUG AUSÊNCIAS (SEM PONTUAÇÃO) ===');
    console.log('Dimensões da imagem:', imageWidth, 'x', imageHeight, '- Alta qualidade:', isHighQuality);
    console.log('EXIF crítico - Make:', !!hasMake, 'Model:', !!hasModel, 'ISO:', !!hasISO, 'CreateDate:', !!hasCreateDate);
    
    if (missingEssentialExif && isHighQuality) {
      indicators.push('EXIF crítico ausente');
      details.push('EXIF crítico ausente (0 pontos): Flag para análise de transporte digital');
      console.log('✓ EXIF crítico ausente: Flag detectada (0 pontos)');
    }

  // 2. Software explícito (+13) - Lista positiva apenas em EXIF:Software/IFD0:Software/XMP:CreatorTool
    const softwareFields = [
      exifData['EXIF:Software'], 
      exifData['IFD0:Software'], 
      exifData['XMP:CreatorTool']
    ].filter(Boolean);
    
    console.log('=== DEBUG SOFTWARE EXPLÍCITO ===');
    console.log('Campos de software encontrados:', {
      'EXIF:Software': exifData['EXIF:Software'],
      'IFD0:Software': exifData['IFD0:Software'], 
      'XMP:CreatorTool': exifData['XMP:CreatorTool']
    });
    
    // Lista positiva de editores (case-insensitive)
    const knownEditors = [
      'photoshop', 'lightroom', 'adobe', 'gimp', 'pixelmator', 'canva', 
      'fotor', 'befunky', 'paint', 'sketch', 'affinity', 'corel', 'paintshop'
    ];
    
    const editingSoftware = softwareFields.some(field => {
      if (!field) return false;
      const fieldLower = String(field).toLowerCase();
      return knownEditors.some(editor => fieldLower.includes(editor));
    });
    
    const detectedEditor = softwareFields.find(field => {
      if (!field) return false;
      const fieldLower = String(field).toLowerCase();
      return knownEditors.some(editor => fieldLower.includes(editor));
    });
    
    console.log('Software de edição detectado:', editingSoftware, 'Valor:', detectedEditor);
    
    if (editingSoftware) {
      score += 13;
      indicators.push('Software explícito');
      details.push(`Software explícito (+13): ${detectedEditor}`);
    }

    // 2a. Software ausente (0 pontos - apenas flag) - Flag para análise
    const hasSoftware = exifData['EXIF:Software'] || exifData['IFD0:Software'] || 
                       exifData['XMP:CreatorTool'] || exifData['EXIF:Creator'] || 
                       exifData['XMP:Software'] || exifData['XMP:Tool'];
    
    if (!editingSoftware && !hasSoftware && isHighQuality) {
      indicators.push('Software ausente');
      details.push('Software ausente (0 pontos): Flag para análise de transporte digital');
    }

    // 2b. Datas EXIF ausentes (0 pontos - apenas flag)
    if (!hasCreateDate && isHighQuality) {
      indicators.push('Datas EXIF ausentes');
      details.push('Datas EXIF ausentes (0 pontos): Flag para análise de transporte digital');
    }

    // 2c. ICC Profile ausente (0 pontos - apenas flag) - Flag para análise
    const hasIccProfile = exifData['ICC_Profile:ProfileDescription'] || exifData['ICC:ProfileDescription'] ||
                         exifData['ICC_Profile:DeviceManufacturer'] || exifData['ICC:DeviceManufacturer'] ||
                         exifData['EXIF:ColorSpace'] || exifData['ColorSpace'];
    
    if (!hasIccProfile && isHighQuality) {
      indicators.push('ICC Profile ausente');
      details.push('ICC Profile ausente (0 pontos): Flag para análise de transporte digital');
    }

    // 3. XMP/Tags IA (0 pontos temporariamente) - Aguardando whitelist
    const xmpFields = Object.keys(exifData).filter(key => key.startsWith('XMP:'));
    const hasAITags = xmpFields.some(field => {
      const value = exifData[field]?.toString().toLowerCase() || '';
      return value.includes('ai') || value.includes('artificial') || 
             value.includes('generated') || value.includes('neural') ||
             value.includes('midjourney') || value.includes('dalle') ||
             value.includes('stable') || value.includes('diffusion') ||
             value.includes('gpt') || value.includes('chatgpt');
    });
    
    if (hasAITags) {
      indicators.push('XMP/Tags IA (não pontuado)');
      details.push('XMP/Tags IA (0 pontos): Tags de IA detectadas (aguardando whitelist)');
    }

    // 4. C2PA/JUMBF Manifest - Restritivo para geração/compósito apenas
    const hasC2PA = exifData['C2PA:Manifest'] || 
                   exifData['JUMBF:Manifest'] ||
                   Object.keys(exifData).some(key => 
                     key.includes('C2PA') || key.includes('JUMBF') || key.includes('Manifest')
                   );
    
    // Verificar se declara geração/compósito/sintético (implementação futura - por ora informativo)
    const c2paContent = Object.keys(exifData)
      .filter(key => key.includes('C2PA') || key.includes('JUMBF'))
      .map(key => String(exifData[key]).toLowerCase())
      .join(' ');
    
    const isGenerative = c2paContent.includes('generated') || c2paContent.includes('composite') || 
                        c2paContent.includes('synthetic') || c2paContent.includes('ai');
    
    if (hasC2PA) {
      if (isGenerative) {
        score += 5;
        indicators.push('C2PA Geração/Compósito');
        details.push('C2PA Geração/Compósito (+5): Manifest indica conteúdo gerado/composto');
      } else {
        indicators.push('C2PA Presente');
        details.push('C2PA Presente (0 pontos): Assinatura de conteúdo (C2PA) detectada');
      }
    }

    // 5. Progressive DCT (peso 3)
    const progressive = exifData['JFIF:EncodingProcess'] || exifData['JPEG:EncodingProcess'] || 
                       exifData['File:EncodingProcess'] || exifData['EXIF:EncodingProcess'] ||
                       exifData['JFIF:ProgressiveDCT'];
    
    const isProgressive = progressive === 'Progressive DCT, Huffman coding' || 
                         progressive === 'Progressive DCT' ||
                         progressive?.toString().toLowerCase().includes('progressive') ||
                         progressive === true;
    
    if (isProgressive) {
      score += 3;
      indicators.push('Progressive DCT');
      details.push('Progressive DCT (+3): Codificação JPEG progressiva');
    }

    // 6. Subsampling YCbCr 4:4:4 (peso 3) 
    const subsampling = exifData['JPEG:ColorComponents'] || exifData['EXIF:YCbCrSubSampling'] || 
                       exifData['JFIF:YCbCrSubSampling'] || exifData['File:YCbCrSubSampling'];
    
    const is444 = subsampling === '4 4 4' || subsampling === 'YCbCr4:4:4' || 
                  subsampling?.toString().includes('4:4:4') || subsampling === '1 1' || subsampling === 1;
    
    if (is444) {
      score += 3;
      indicators.push('YCbCr 4:4:4');
      details.push('YCbCr 4:4:4 (+3): Subsampling sem compressão');
    }

    // 6a. APP14 Adobe (peso 3)
    const hasAPP14 = exifData['APP14:ColorTransform'] !== undefined || 
                     exifData['APP14:DCTEncodeVersion'] !== undefined ||
                     Object.keys(exifData).some(key => key.toLowerCase().includes('app14'));
    
    if (hasAPP14) {
      score += 3;
      indicators.push('APP14 Adobe');
      details.push('APP14 Adobe (+3): Marcador técnico Adobe presente');
    }

    // 7. ICC Profile específico (peso 3) - HP/Adobe/ProPhoto/ROMM/Adobe RGB
    const iccDescription = exifData['ICC_Profile:ProfileDescription'] || exifData['EXIF:ColorSpace'] || 
                          exifData['ICC:ProfileDescription'] || exifData['ColorSpace'] ||
                          exifData['ICC_Profile:DeviceManufacturer'] || exifData['ICC:DeviceManufacturer'] ||
                          exifData['ICC-header:ProfileCreator'];
    
    const hasSpecificICC = iccDescription && (
                       iccDescription.toString().toLowerCase().includes('adobe') ||
                       iccDescription.toString().toLowerCase().includes('hewlett') ||
                       iccDescription.toString().toLowerCase().includes('hp') ||
                       iccDescription.toString().toLowerCase().includes('prophoto') ||
                       iccDescription.toString().toLowerCase().includes('romm') ||
                       iccDescription.toString().toLowerCase().includes('adobe rgb') ||
                       exifData['ICC_Profile:DeviceManufacturer']?.toString().toLowerCase().includes('adbe') ||
                       exifData['ICC_Profile:DeviceManufacturer']?.toString().toLowerCase().includes('hp')
                      );
    
    if (hasSpecificICC) {
      score += 3;
      indicators.push('ICC específico');
      details.push('ICC específico (+3): Perfil ICC Adobe/HP/ProPhoto/ROMM presente');
    }

    // 8. SceneType inconsistente (peso 2) - Detectar valor "Unknown" ou ausente (BeFunky/editores)
    const sceneType = exifData['EXIF:SceneType'] || exifData['EXIF:SceneCaptureType'] || 
                      exifData['IFD0:SceneType'] || exifData['IFD0:SceneCaptureType'] ||
                      exifData['ExifIFD:SceneType'] || exifData['ExifIFD:SceneCaptureType'];
    
    // Detectar "Unknown" mesmo com texto adicional como "Unknown (49)"
    const sceneTypeStr = String(sceneType || '').toLowerCase();
    const hasInconsistentSceneType = sceneType && (
      sceneTypeStr.includes('unknown') || 
      sceneType === 0 || 
      sceneType === '0'
    );
    
    if (hasInconsistentSceneType) {
      score += 2;
      indicators.push('SceneType inconsistente');
      details.push(`SceneType inconsistente (+2): Valor "${sceneType}" típico de editores como BeFunky`);
      console.log('SceneType detectado:', sceneType, 'Campo encontrado:', Object.keys(exifData).find(key => 
        key.includes('SceneType') || key.includes('SceneCaptureType')));
    }

    return { 
      score, 
      indicators, 
      details, 
      isProgressive, 
      is444, 
      hasSpecificICC,
      editingSoftware,
      hasAITags,
      hasC2PA,
      missingEssentialExif,
      hasInconsistentSceneType,
      hasAPP14
    };
  }, [exifData, isOriginalFile]);

  // Generate summary information
  const summary = useMemo(() => {
    const info: Record<string, string> = {};
    
    // Basic file info
    if (fileMetadata.file_name) info['Nome do arquivo'] = fileMetadata.file_name;
    if (fileMetadata.mime_type) info['Tipo MIME'] = fileMetadata.mime_type;
    if (fileMetadata.size_bytes) info['Tamanho'] = formatFileSize(fileMetadata.size_bytes);

    // Camera info from EXIF
    if (exifData['EXIF:Make']) info['Fabricante'] = exifData['EXIF:Make'];
    if (exifData['EXIF:Model']) info['Modelo'] = exifData['EXIF:Model'];
    if (exifData['EXIF:DateTime']) info['Data/Hora'] = exifData['EXIF:DateTime'];
    
    // Image dimensions
    if (exifData['EXIF:ExifImageWidth'] && exifData['EXIF:ExifImageHeight']) {
      info['Dimensões'] = `${exifData['EXIF:ExifImageWidth']} × ${exifData['EXIF:ExifImageHeight']}`;
    }

    return info;
  }, [exifData, fileMetadata]);

  // Co-occurrence bonuses - Apenas 2 bônus globais
  const cooccurrenceBonus = useMemo(() => {
    let bonus = 0;
    const appliedBonuses: string[] = [];
    
    console.log('=== DEBUG BÔNUS DE CO-OCORRÊNCIA ===');
    console.log('Progressive:', manipulationScore.isProgressive, '4:4:4:', manipulationScore.is444);
    console.log('ICC específico:', manipulationScore.hasSpecificICC, 'Software explícito:', manipulationScore.editingSoftware);
    
    // Bônus 1: Progressive + 4:4:4 → +2
    if (manipulationScore.isProgressive && manipulationScore.is444) {
      bonus += 2;
      appliedBonuses.push('Progressive + Subamostragem 4:4:4 (+2)');
      console.log('✓ Bônus 1 aplicado: Progressive + 4:4:4');
    }
    
    // Bônus 2: ICC específico + Software explícito → +2
    if (manipulationScore.hasSpecificICC && manipulationScore.editingSoftware) {
      bonus += 2;
      appliedBonuses.push('ICC específico + Software explícito (+2)');
      console.log('✓ Bônus 2 aplicado: ICC específico + Software explícito');
    }
    
    console.log('Total de bônus aplicados:', bonus, appliedBonuses);
    
    return { total: bonus, applied: appliedBonuses };
  }, [exifData, manipulationScore]);

  // Calculate final suspicion score
  const finalScore = useMemo(() => {
    return Math.min(manipulationScore.score + cooccurrenceBonus.total, 50); // Maximum reasonable suspicion score
  }, [manipulationScore.score, cooccurrenceBonus.total]);

  // Helper functions for digital transport detection
  // Intentional Editing Indicators Detection
  const hasIntentionalEditingIndicators = useMemo(() => {
    if (!exifData) return false;
    
    const indicators = [];
    
    // Progressive DCT
    const progressiveDCT = manipulationScore.isProgressive;
    if (progressiveDCT) {
      indicators.push('Progressive DCT');
    }
    
    // 4:4:4 Subsampling  
    const is444 = manipulationScore.is444;
    if (is444) {
      indicators.push('Subamostragem 4:4:4');
    }
    
    // Detected resizing (from manipulation score logic) - checking for non-standard aspect ratios
    const width = exifData['EXIF:ExifImageWidth'] || exifData['File:ImageWidth'];
    const height = exifData['EXIF:ExifImageHeight'] || exifData['File:ImageHeight'];
    if (width && height) {
      const aspectRatio = parseInt(width) / parseInt(height);
      const commonRatios = [16/9, 4/3, 3/2, 1/1, 9/16, 3/4, 2/3];
      const isCommonRatio = commonRatios.some(ratio => Math.abs(aspectRatio - ratio) < 0.05);
      if (!isCommonRatio) {
        indicators.push('Proporção não-padrão (possível crop)');
      }
    }
    
    // Editing software present (from manipulation score)
    const hasEditor = manipulationScore.editingSoftware;
    if (hasEditor) {
      indicators.push('Software de edição detectado');
    }
    
    // Specific ICC profiles (HP/Adobe)
    const hasSpecificICC = manipulationScore.hasSpecificICC;
    if (hasSpecificICC) {
      indicators.push('ICC Profile específico');
    }
    
    // Check co-occurrence bonuses (indicates complex editing)
    const hasCooccurrenceBonuses = cooccurrenceBonus.total > 0;
    if (hasCooccurrenceBonuses) {
      indicators.push('Padrões de co-ocorrência detectados');
    }
    
    console.log('🎨 Intentional Editing Indicators:', indicators);
    
    return indicators.length > 0;
  }, [exifData, manipulationScore, cooccurrenceBonus]);

  // Digital Transport Detection
  const checkCriticalExifMissing = useMemo(() => {
    if (!exifData) return false;
    
    // Check for critical EXIF tags in both EXIF and IFD0 variants
    const hasMake = exifData['EXIF:Make'] || exifData['IFD0:Make'];
    const hasModel = exifData['EXIF:Model'] || exifData['IFD0:Model']; 
    const hasDateTime = exifData['EXIF:DateTime'] || exifData['EXIF:DateTimeOriginal'] || exifData['EXIF:CreateDate'];
    
    const hasCritical = hasMake || hasModel || hasDateTime;
    const result = !hasCritical;
    
    if (result) {
      const missing = [];
      if (!hasMake) missing.push('Make');
      if (!hasModel) missing.push('Model'); 
      if (!hasDateTime) missing.push('DateTime');
      console.log('🔍 Digital Transport Check - Critical EXIF missing:', missing);
    }
    
    return result;
  }, [exifData]);

  const check420Subsampling = useMemo(() => {
    if (!exifData) return false;
    
    // Buscar YCbCr subsampling com fallback para JFIF
    const ycbcrSampling = exifData['File:YCbCrSubSampling'] || 
                         exifData['EXIF:YCbCrSubSampling'] ||
                         exifData['Composite:YCbCrSubSampling'] ||
                         exifData['JFIF:YCbCrSubSampling']; // Fallback para JFIF
    
    if (!ycbcrSampling) {
      console.log('🔍 Digital Transport Check - YCbCr não encontrado');
      return false;
    }
    
    // Normalizar e aceitar variações de 4:2:0
    const normalized = String(ycbcrSampling).toLowerCase().trim();
    const is420 = normalized === '2 2' || 
                  normalized === '2, 2' || 
                  normalized === '4:2:0' || 
                  normalized.includes('ycbcr4:2:0') ||
                  normalized.includes('4:2:0 (2 2)');
    
    // Rejeitar explicitamente 4:2:2 ("2 1")
    const is422 = normalized === '2 1' || normalized === '2, 1';
    
    const result = is420 && !is422;
    
    console.log('🔍 Digital Transport Check - 4:2:0 Subsampling:', result, 'Valor normalizado:', normalized);
    
    return result;
  }, [exifData]);

  const checkNoEditorMarks = useMemo(() => {
    if (!exifData) return false;
    
    // Lista curta: apenas os campos essenciais para transporte digital
    const editorTags = [
      'EXIF:Software', 
      'XMP:CreatorTool', 
      'APP14:Adobe',
      'PhotoshopQuality'
    ];
    
    // Outros campos apenas para log (não bloqueiam transporte)
    const additionalTags = [
      'XMP:HistoryAction', 'EXIF:ProcessingSoftware', 'EXIF:HostComputer'
    ];
    
    const hasEssentialEditor = editorTags.some(tag => exifData[tag]);
    const hasAdditionalMarks = additionalTags.some(tag => exifData[tag]);
    
    const result = !hasEssentialEditor;
    
    if (hasAdditionalMarks) {
      console.log('🔍 Digital Transport Check - Additional marks (não bloqueiam):', 
        additionalTags.filter(tag => exifData[tag]).map(tag => `${tag}: ${exifData[tag]}`));
    }
    
    if (!result) {
      console.log('🔍 Digital Transport Check - Essential editor marks found:', 
        editorTags.filter(tag => exifData[tag]).map(tag => `${tag}: ${exifData[tag]}`));
    }
    
    return result;
  }, [exifData]);

  const checkNeutralICC = useMemo(() => {
    if (!exifData) return false;
    
    // Buscar ICC Profile ou descrição
    const iccDescription = exifData['ICC_Profile:ProfileDescription'] || 
                          exifData['ICC:ProfileDescription'] ||
                          exifData['EXIF:ColorSpace'] ||
                          exifData['ColorSpace'] ||
                          exifData['ICC_Profile:DeviceManufacturer'] ||
                          exifData['ICC:DeviceManufacturer'] ||
                          exifData['ICC-header:ProfileCreator'];
    
    if (!iccDescription) {
      console.log('🔍 Digital Transport Check - Sem ICC Profile: NEUTRO');
      return true; // Sem ICC = neutro
    }
    
    // Verificar se NÃO contém perfis específicos (case-insensitive)
    const description = String(iccDescription).toLowerCase();
    const isSpecific = description.includes('adobe') ||
                      description.includes('hewlett') ||
                      description.includes('hp') ||
                      description.includes('prophoto') ||
                      description.includes('romm') ||
                      description.includes('adobe rgb');
    
    const result = !isSpecific; // É neutro se NÃO for específico (sRGB = neutro)
    
    console.log('🔍 Digital Transport Check - ICC Profile:', description, 'É neutro:', result);
    
    return result;
  }, [exifData]);

  const optionalReinforcements = useMemo(() => {
    if (!exifData) return [];
    
    const reinforcements = [];
    
    // Low resolution/DPI
    const xResolution = exifData['EXIF:XResolution'] || exifData['JFIF:XResolution'];
    const yResolution = exifData['EXIF:YResolution'] || exifData['JFIF:YResolution'];
    if ((xResolution && parseFloat(xResolution) <= 72) || (yResolution && parseFloat(yResolution) <= 72)) {
      reinforcements.push('Baixa resolução/DPI');
    }
    
    // Small file size for dimensions
    if (fileMetadata?.size_bytes && exifData['EXIF:ExifImageWidth'] && exifData['EXIF:ExifImageHeight']) {
      const width = parseInt(exifData['EXIF:ExifImageWidth']);
      const height = parseInt(exifData['EXIF:ExifImageHeight']);
      const pixels = width * height;
      const bytesPerPixel = fileMetadata.size_bytes / pixels;
      
      if (bytesPerPixel < 0.5) { // Less than 0.5 bytes per pixel indicates high compression
        reinforcements.push('Compressão alta para dimensões');
      }
    }
    
    // Generic JFIF identifier
    const jfifVersion = exifData['JFIF:JFIFVersion'];
    if (jfifVersion) {
      reinforcements.push('Presença de JFIF genérico');
    }
    
    console.log('🔍 Digital Transport Check - Optional reinforcements:', reinforcements);
    
    return reinforcements;
  }, [exifData, fileMetadata]);

  const isDigitalTransport = useMemo(() => {
    const criteria = [
      { name: 'EXIF crítico ausente', met: checkCriticalExifMissing },
      { name: '4:2:0 subsampling', met: check420Subsampling },
      { name: 'Sem marcas de editor', met: checkNoEditorMarks }, 
      { name: 'ICC neutro', met: checkNeutralICC }
    ];
    
    const allCriteriaMet = criteria.every(c => c.met);
    const hasIntentionalEditing = hasIntentionalEditingIndicators;
    
    // Exclusões que bloqueiam transporte digital
    const hasProgressiveDCT = manipulationScore.isProgressive;
    const has444Subsampling = manipulationScore.is444;
    const hasEditorMarks = manipulationScore.editingSoftware;
    const hasSpecificICC = manipulationScore.hasSpecificICC;
    
    const isExcluded = hasProgressiveDCT || has444Subsampling || hasEditorMarks || hasSpecificICC;
    
    // Transporte digital: AND dos 4 critérios SEM exclusões (sem exigir reforços)
    const result = allCriteriaMet && !isExcluded;
    
    console.log('🔍 Digital Transport Final Check:');
    criteria.forEach(c => console.log(`  - ${c.name}:`, c.met));
    console.log('  - All criteria met:', allCriteriaMet);
    console.log('  - Exclusões: Progressive:', hasProgressiveDCT, '4:4:4:', has444Subsampling, 
                'Editor:', hasEditorMarks, 'ICC específico:', hasSpecificICC);
    console.log('  - Is excluded:', isExcluded);
    console.log('  - Reforços opcionais:', optionalReinforcements, '(não exigidos)');
    console.log('  - Result (Digital Transport):', result);
    
    return result;
  }, [checkCriticalExifMissing, check420Subsampling, checkNoEditorMarks, checkNeutralICC, optionalReinforcements, hasIntentionalEditingIndicators, manipulationScore]);

  // Apply digital transport limitation
  const adjustedScore = isDigitalTransport ? Math.min(finalScore, 7) : finalScore;

  // Classification based on final score - Tabela de Validação
  const classification = useMemo(() => {
    // Classificação baseada na tabela oficial: 0-3, 4-7, 8-12, ≥13
    if (adjustedScore <= 3) return { 
      level: 'Baixo', 
      description: 'Sem indícios de alteração', 
      color: 'text-green-600', 
      bgColor: 'bg-green-50' 
    };
    if (adjustedScore <= 7) return { 
      level: 'Moderado', 
      description: 'Indícios fracos de alteração', 
      color: 'text-yellow-600', 
      bgColor: 'bg-yellow-50' 
    };
    if (adjustedScore <= 12) return { 
      level: 'Forte', 
      description: 'Indícios fortes de alteração', 
      color: 'text-orange-600', 
      bgColor: 'bg-orange-50' 
    };
    return { 
      level: 'Muito Forte', 
      description: 'Evidências de alteração digital', 
      color: 'text-red-600', 
      bgColor: 'bg-red-50' 
    };
  }, [adjustedScore]);

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const downloadMetadata = () => {
    const dataStr = JSON.stringify({ 
      fileInfo: fileMetadata,
      exifData: exifData,
      organizedData: organizedMetadata,
      manipulationAnalysis: {
        score: manipulationScore.score,
        indicators: manipulationScore.indicators,
        cooccurrenceBonus: cooccurrenceBonus.total,
        finalScore: adjustedScore,
        classification: classification,
        isDigitalTransport
      }
    }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manipulation_analysis_${fileMetadata.file_name || 'arquivo'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderMetadataGroup = (groupData: Record<string, any>, title: string, icon: React.ReactNode) => {
    const entries = Object.entries(groupData);
    if (entries.length === 0) return null;

    return (
      <AccordionItem value={title.toLowerCase().replace(/\s+/g, '-')} className="border border-border rounded-lg mb-4">
        <AccordionTrigger className="flex items-center gap-3 px-4 py-3 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {icon}
            </div>
            <div>
              <h3 className="font-semibold text-left">{title}</h3>
              <p className="text-sm text-muted-foreground text-left">{entries.length} campos</p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entries.map(([key, value]) => (
              <div key={key} className="bg-muted/30 rounded-lg p-3">
                <div className="font-medium text-sm text-muted-foreground mb-1">{key}</div>
                <div className="text-sm text-foreground break-all">{formatValue(value)}</div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8">
        <div className="bg-gradient-card border border-border rounded-lg p-8 shadow-card">
          <div className="flex items-center justify-center space-x-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-lg text-muted-foreground">Extraindo metadados...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 space-y-6">
      {/* Header */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Análise de Metadados</h2>
            <p className="text-muted-foreground">
              Dados extraídos com ExifTool API • {Object.keys(exifData).length} campos encontrados
            </p>
          </div>
          <Button onClick={downloadMetadata} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Baixar JSON
          </Button>
        </div>
      </div>

      {/* Manipulation Analysis Section */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-foreground mb-2">Análise de Suspeição de Manipulação</h3>
          <p className="text-muted-foreground">
            Detecção de indícios de manipulação baseada na matriz forense
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Score Base */}
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <div className="text-3xl font-bold text-primary mb-2">{manipulationScore.score}</div>
            <div className="text-sm text-muted-foreground mb-1">Score Base</div>
            <div className="text-xs text-muted-foreground">Indícios de Manipulação</div>
          </div>

          {/* Bônus de Coocorrência */}
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <div className="text-3xl font-bold text-blue-500 mb-2">+{cooccurrenceBonus.total}</div>
            <div className="text-sm text-muted-foreground mb-1">Bônus Coocorrência</div>
            <div className="text-xs text-muted-foreground">Correlações Encontradas</div>
          </div>

          {/* Pontuação Final */}
          <div className="text-center p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg border-2 border-primary/30">
            <div className="text-4xl font-bold text-primary mb-2">{adjustedScore}</div>
            <div className="text-sm text-muted-foreground mb-1">Pontuação Final</div>
            <div className="text-xs text-muted-foreground">Suspeição de Manipulação</div>
            {isDigitalTransport && (
              <div className="text-xs text-yellow-600 mt-1 p-2 bg-yellow-50 rounded">
                🚛 Transporte digital detectado (sem EXIF crítico, 4:2:0, sem software, ICC neutro). Severidade limitada a Moderado.
              </div>
            )}
          </div>
        </div>

        {/* Classification */}
        <div className={`p-6 rounded-lg border-2 ${classification.bgColor} border-current`}>
          <div className="text-center">
            <div className={`text-2xl font-bold ${classification.color} mb-2`}>
              Nível de Suspeição: {classification.level}
            </div>
            <div className="text-muted-foreground mb-4">{classification.description}</div>
            
            {/* Informação sobre arquivo original - apenas informativo */}
            {isOriginalFile && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-800 font-medium">📷 Arquivo Original de Câmera (Informativo)</div>
                <div className="text-xs text-blue-600 mt-1">
                  EXIF completo de câmera detectado - apenas para contexto
                </div>
              </div>
            )}
            
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  adjustedScore <= 3 ? 'bg-green-500' :
                  adjustedScore <= 7 ? 'bg-yellow-500' :
                  adjustedScore <= 12 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(adjustedScore / 20 * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Co-occurrence Bonuses */}
        <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card mt-6">
          <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            Bônus de Co-ocorrência ({cooccurrenceBonus.applied.length} aplicados)
          </h4>
          
          {cooccurrenceBonus.applied.length > 0 ? (
            <div className="space-y-3">
              {cooccurrenceBonus.applied.map((bonus, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm text-blue-800">{bonus}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Nenhum bônus de co-ocorrência aplicado</p>
          )}
        </div>
      </div>

      {/* Manipulation Indicators Section */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <h3 className="text-xl font-bold text-foreground mb-4">Indícios de Manipulação Detectados</h3>
        
        {manipulationScore.indicators.length > 0 ? (
          <div className="space-y-3">
            {manipulationScore.indicators.map((indicator, index) => {
              // Special styling for C2PA Presente (informational seal)
              const isC2PAPresent = indicator === 'C2PA Presente';
              const isNonScoring = indicator.includes('(não pontuado)') || indicator.includes('(0 pontos)');
              
              return (
                <div 
                  key={index} 
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    isC2PAPresent ? 'bg-blue-50' : 
                    isNonScoring ? 'bg-gray-50' : 'bg-red-50'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    isC2PAPresent ? 'bg-blue-500' : 
                    isNonScoring ? 'bg-gray-500' : 'bg-red-500'
                  }`}></div>
                  <span className={`text-sm ${
                    isC2PAPresent ? 'text-blue-800' : 
                    isNonScoring ? 'text-gray-800' : 'text-red-800'
                  }`}>
                    {indicator}
                    {isC2PAPresent && ' 🛡️'}
                  </span>
                </div>
              );
            })}
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Total de pontos de suspeição:</strong> {manipulationScore.score}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-800">
              Nenhum indício significativo de manipulação detectado.
            </p>
          </div>
        )}
      </div>

      {/* File Summary */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <h3 className="text-xl font-bold text-foreground mb-4">Resumo do Arquivo</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="font-medium text-sm">{key}:</span>
              <span className="text-sm text-muted-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata Groups */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <h3 className="text-xl font-bold text-foreground mb-4">Metadados Detalhados</h3>
        
        <Accordion type="multiple" className="w-full">
          {renderMetadataGroup(organizedMetadata.file, 'Informações do Arquivo', <FileText className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.exif, 'Dados EXIF (Câmera)', <Camera className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.gps, 'Localização GPS', <MapPin className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.icc, 'Perfil de Cor ICC', <Palette className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.adobe, 'Tags Adobe/XMP', <ImageIcon className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.composite, 'Dados Compostos/JFIF', <FileText className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.other, 'Outros Metadados', <FileText className="h-5 w-5 text-primary" />)}
        </Accordion>
      </div>
    </div>
  );
}