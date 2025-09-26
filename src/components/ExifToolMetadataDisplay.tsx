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

    // 1. EXIF crítico ausente (peso 4) - Detecção de remoção intencional
    const hasMake = exifData['EXIF:Make'] || exifData['IFD0:Make'];
    const hasModel = exifData['EXIF:Model'] || exifData['IFD0:Model'];
    const hasISO = exifData['EXIF:ISO'] || exifData['EXIF:RecommendedExposureIndex'] || exifData['EXIF:ISOSpeedRatings'];
    const hasCreateDate = exifData['EXIF:CreateDate'] || exifData['EXIF:DateTimeOriginal'];
    
    const missingEssentialExif = !hasMake || !hasModel || !hasISO || !hasCreateDate;
    
    // Detectar remoção intencional de EXIF (alta qualidade + ausência de metadados críticos)
    const imageWidth = parseInt(exifData['EXIF:ImageWidth'] || exifData['File:ImageWidth'] || '0');
    const imageHeight = parseInt(exifData['EXIF:ImageHeight'] || exifData['File:ImageHeight'] || '0');
    const isHighQuality = imageWidth >= 800 && imageHeight >= 600; // Imagem de tamanho significativo
    
    console.log('=== DEBUG AUSÊNCIAS INTENCIONAIS ===');
    console.log('Dimensões da imagem:', imageWidth, 'x', imageHeight, '- Alta qualidade:', isHighQuality);
    console.log('EXIF crítico - Make:', !!hasMake, 'Model:', !!hasModel, 'ISO:', !!hasISO, 'CreateDate:', !!hasCreateDate);
    
    if (missingEssentialExif && isHighQuality) {
      score += 4;
      indicators.push('EXIF crítico ausente');
      details.push('EXIF crítico ausente (+4): Ausência de Make, Model, ISO ou CreateDate em imagem de alta qualidade');
      console.log('✓ EXIF crítico ausente: +4 pontos');
    }

    // 2. Software explícito (peso 4) - Detecção robusta de tags Adobe/Photoshop
    const allExifFields = Object.keys(exifData);
    const allExifValues = Object.values(exifData).map(v => String(v).toLowerCase());
    const allExifText = allExifFields.join(' ').toLowerCase() + ' ' + allExifValues.join(' ');
    
    // Debug: Log detalhado para Adobe/Photoshop
    console.log('=== DEBUG ADOBE/PHOTOSHOP ===');
    
    const adobeFields = allExifFields.filter(key => {
      const keyLower = key.toLowerCase();
      const valueLower = String(exifData[key]).toLowerCase();
      return keyLower.includes('adobe') || keyLower.includes('photoshop') || keyLower.includes('app14') ||
             valueLower.includes('adobe') || valueLower.includes('photoshop');
    });
    
    console.log('Campos que contêm Adobe/Photoshop/APP14:', 
      adobeFields.map(key => `${key}: ${exifData[key]}`)
    );
    
    // Verificações específicas para debugging
    console.log('ICC-header:ProfileCreator:', exifData['ICC-header:ProfileCreator']);
    console.log('Campos APP14:', allExifFields.filter(key => key.toLowerCase().includes('app14')));
    console.log('Campos que começam com Adobe:', allExifFields.filter(key => key.startsWith('Adobe:')));
    
    // Busca robusta por indicadores Adobe/Photoshop
    const adobeIndicators = [
      // Tags diretas Adobe/Photoshop em qualquer campo
      allExifText.includes('photoshop'),
      allExifText.includes('adobe'),
      
      // APP14 e flags Adobe específicos
      allExifFields.some(key => key.toLowerCase().includes('app14')),
      exifData['APP14:ColorTransform'] !== undefined,
      exifData['APP14:DCTEncodeVersion'] !== undefined,
      exifData['Adobe:DCTEncodeVersion'] !== undefined,
      
      // Campos Adobe específicos por prefixo
      allExifFields.some(key => key.startsWith('Adobe:')),
      allExifFields.some(key => key.startsWith('Photoshop:')),
      
      // Software de edição nos campos tradicionais
      ['EXIF:Software', 'IFD0:Software', 'XMP:CreatorTool', 'EXIF:Creator', 'XMP:Software'].some(field => {
        const soft = String(exifData[field] || '').toLowerCase();
        return soft.includes('photoshop') || soft.includes('lightroom') || soft.includes('adobe') ||
               soft.includes('gimp') || soft.includes('pixelmator') || soft.includes('canva') ||
               soft.includes('editor') || soft.includes('paint') || soft.includes('sketch');
      }),
      
      // ICC Profile HP/Adobe (indicador adicional)
      String(exifData['ICC-header:ProfileCreator'] || '').toLowerCase().includes('hewlett-packard') ||
      String(exifData['ICC_Profile:ProfileDescription'] || '').toLowerCase().includes('adobe'),
      
      // Outros padrões técnicos Adobe
      exifData['JFIF:YCbCrSubSampling'] === '4 4 4' && allExifText.includes('adobe')
    ];
    
    const activeIndicators = adobeIndicators.map((indicator, index) => {
      const labels = [
        'Photoshop no texto',
        'Adobe no texto', 
        'Campos APP14',
        'APP14:ColorTransform',
        'APP14:DCTEncodeVersion',
        'Adobe:DCTEncodeVersion',
        'Prefixo Adobe:',
        'Prefixo Photoshop:',
        'Software de edição',
        'ICC HP/Adobe',
        'YCbCr 4:4:4 + Adobe'
      ];
      return indicator ? labels[index] : null;
    }).filter(Boolean);
    
    console.log('Indicadores Adobe encontrados:', activeIndicators);
    
    const editingSoftware = adobeIndicators.some(indicator => indicator);
    console.log('editingSoftware (Adobe/Photoshop):', editingSoftware);
    
    if (editingSoftware) {
      score += 13;
      indicators.push('Software explícito');
      details.push(`Software explícito (+13): ${activeIndicators.join(', ')}`);
    }

    // 2a. Software ausente (peso 2) - Quando esperado mas não está presente
    if (!editingSoftware && isHighQuality) {
      // Verificar se deveria ter software de edição mas não tem
      const hasSoftware = exifData['EXIF:Software'] || exifData['IFD0:Software'] || 
                         exifData['XMP:CreatorTool'] || exifData['EXIF:Creator'] || 
                         exifData['XMP:Software'] || exifData['XMP:Tool'];
      
      if (!hasSoftware) {
        score += 2;
        indicators.push('Software ausente');
        details.push('Software ausente (+2): Ausência completa de informações de software em imagem de alta qualidade');
      }
    }

    // 2b. Datas EXIF ausentes (peso 3)
    if (!hasCreateDate && isHighQuality) {
      score += 3;
      indicators.push('Datas EXIF ausentes');
      details.push('Datas EXIF ausentes (+3): Ausência de CreateDate/DateTimeOriginal em imagem de alta qualidade');
    }

    // 2c. ICC Profile ausente (peso 3) - Detectar ausência quando esperado
    const hasIccProfile = exifData['ICC_Profile:ProfileDescription'] || exifData['ICC:ProfileDescription'] ||
                         exifData['ICC_Profile:DeviceManufacturer'] || exifData['ICC:DeviceManufacturer'] ||
                         exifData['EXIF:ColorSpace'] || exifData['ColorSpace'];
    
    if (!hasIccProfile && isHighQuality) {
      score += 3;
      indicators.push('ICC Profile ausente');
      details.push('ICC Profile ausente (+3): Ausência de perfil ICC em imagem de alta qualidade');
    }

    // 3. XMP/Tags IA (peso 5) - Procurar tags específicas de IA
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
      score += 5;
      indicators.push('XMP/Tags IA');
      details.push('XMP/Tags IA (+5): Tags de inteligência artificial detectadas');
    }

    // 4. C2PA/JUMBF Manifest (peso 5) - Detectar blocos criptográficos
    const hasC2PA = exifData['C2PA:Manifest'] || 
                   exifData['JUMBF:Manifest'] ||
                   Object.keys(exifData).some(key => 
                     key.includes('C2PA') || key.includes('JUMBF') || key.includes('Manifest')
                   );
    
    if (hasC2PA) {
      score += 5;
      indicators.push('C2PA/JUMBF Manifest');
      details.push('C2PA/JUMBF Manifest (+5): Manifest de autenticidade de conteúdo detectado');
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

    // 7. ICC Profile HP/Adobe (peso 3) - Apenas quando perfil específico está presente
    const iccDescription = exifData['ICC_Profile:ProfileDescription'] || exifData['EXIF:ColorSpace'] || 
                          exifData['ICC:ProfileDescription'] || exifData['ColorSpace'] ||
                          exifData['ICC_Profile:DeviceManufacturer'] || exifData['ICC:DeviceManufacturer'];
    
    const hasHPAdobe = iccDescription && (
                       iccDescription.toString().toLowerCase().includes('hp') || 
                       iccDescription.toString().toLowerCase().includes('adobe') ||
                       iccDescription.toString().toLowerCase().includes('hewlett') ||
                       exifData['ICC_Profile:DeviceManufacturer']?.toString().toLowerCase().includes('adbe') ||
                       exifData['ICC_Profile:DeviceManufacturer']?.toString().toLowerCase().includes('hp')
                      );
    
    if (hasHPAdobe) {
      score += 3;
      indicators.push('ICC HP/Adobe');
      details.push('ICC HP/Adobe (+3): Perfil ICC específico HP/Adobe presente');
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
      hasHPAdobe,
      editingSoftware,
      hasAITags,
      hasC2PA,
      missingEssentialExif,
      hasInconsistentSceneType
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

  // Co-occurrence bonuses for manipulation patterns - Tabela de Validação Completa
  const cooccurrenceBonus = useMemo(() => {
    let bonus = 0;
    const appliedBonuses: string[] = [];
    
    // Verificar datas inconsistentes
    const hasInconsistentDates = (() => {
      const dateOriginal = exifData['EXIF:DateTimeOriginal'];
      const dateModify = exifData['EXIF:ModifyDate'] || exifData['XMP:ModifyDate'] || exifData['File:FileModifyDate'];
      const dateCreate = exifData['EXIF:CreateDate'];
      
      if (dateOriginal && dateModify) {
        try {
          const origDate = new Date(dateOriginal.replace(/:/g, '-', 2));
          const modDate = new Date(dateModify.replace(/:/g, '-', 2));
          const timeDiff = Math.abs(modDate.getTime() - origDate.getTime()) / (1000 * 60 * 60); // hours
          return timeDiff > 24; // Mais de 24 horas de diferença
        } catch (error) {
          return false;
        }
      }
      return false;
    })();
    
    // Verificar redimensionamento
    const hasResizing = (() => {
      const width = exifData['EXIF:ExifImageWidth'] || exifData['File:ImageWidth'] || exifData['EXIF:ImageWidth'];
      const height = exifData['EXIF:ExifImageHeight'] || exifData['File:ImageHeight'] || exifData['EXIF:ImageHeight'];
      
      if (width && height) {
        // Verificar se não é uma resolução padrão de câmera
        const commonResolutions = [
          [1920, 1080], [3840, 2160], [4032, 3024], [6000, 4000], 
          [5472, 3648], [4608, 3072], [3000, 2000], [2048, 1536]
        ];
        
        const isCommonResolution = commonResolutions.some(([w, h]) => 
          (width === w && height === h) || (width === h && height === w)
        );
        
        // Verificar múltiplos de 16 (padrão de codificação)
        const isStandardMultiple = (width % 16 === 0) && (height % 16 === 0);
        
        return !isCommonResolution || !isStandardMultiple;
      }
      return false;
    })();
    
    // Bonus 1: Datas incoerentes + (Progressive/4:4:4 ou ICC+Adobe) (+2 pontos)
    if (hasInconsistentDates && ((manipulationScore.isProgressive || manipulationScore.is444) || 
        (manipulationScore.hasHPAdobe && manipulationScore.editingSoftware))) {
      bonus += 2;
      appliedBonuses.push('Datas incoerentes + padrão de edição (+2)');
    }
    
    // Bonus 2: Redimensionamento + (Progressive ou 4:4:4) (+2 pontos)  
    if (hasResizing && (manipulationScore.isProgressive || manipulationScore.is444)) {
      bonus += 2;
      appliedBonuses.push('Redimensionamento + reprocessamento (+2)');
    }
    
    // Bonus 3: Progressive DCT + YCbCr 4:4:4 Subsampling (+2 pontos)
    if (manipulationScore.isProgressive && manipulationScore.is444) {
      bonus += 2;
      appliedBonuses.push('Progressive DCT + Subamostragem 4:4:4 (+2)');
    }
    
    // Bonus 4: ICC HP + Progressive (+2 pontos)
    if (manipulationScore.hasHPAdobe && manipulationScore.isProgressive) {
      bonus += 2;
      appliedBonuses.push('ICC HP/Adobe + Progressive (+2)');
    }
    
    // Bonus 5: Tags IA + EXIF preservado (+3 pontos)
    if (manipulationScore.hasAITags && !manipulationScore.missingEssentialExif) {
      bonus += 3;
      appliedBonuses.push('Tags IA + EXIF preservado (+3)');
    }
    
    // Bonus 6: C2PA + qualquer indicador de edição (+3 pontos)
    if (manipulationScore.hasC2PA && (manipulationScore.editingSoftware || manipulationScore.isProgressive || manipulationScore.is444)) {
      bonus += 3;
      appliedBonuses.push('C2PA + indicador de edição (+3)');
    }
    
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
    const hasSpecificICC = manipulationScore.hasHPAdobe;
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
    
    const criticalTags = ['EXIF:Make', 'EXIF:Model', 'EXIF:DateTime'];
    const hasCritical = criticalTags.some(tag => exifData[tag]);
    const result = !hasCritical;
    
    if (result) {
      console.log('🔍 Digital Transport Check - Critical EXIF missing:', criticalTags.filter(tag => !exifData[tag]));
    }
    
    return result;
  }, [exifData]);

  const check420Subsampling = useMemo(() => {
    if (!exifData) return false;
    
    const ycbcrSampling = exifData['EXIF:YCbCrSubSampling'] || 
                         exifData['Composite:YCbCrSubSampling'] ||
                         exifData['JFIF:YCbCrSubSampling'] ||
                         exifData['File:YCbCrSubSampling'];
    const result = ycbcrSampling === '2 1' || ycbcrSampling === '2, 1' || ycbcrSampling === '2 2';
    
    console.log('🔍 Digital Transport Check - 4:2:0 Subsampling:', result, 'Value:', ycbcrSampling);
    
    return result;
  }, [exifData]);

  const checkNoEditorMarks = useMemo(() => {
    if (!exifData) return false;
    
    const editorTags = [
      'EXIF:Software', 'XMP:CreatorTool', 'XMP:HistoryAction',
      'EXIF:ProcessingSoftware', 'EXIF:HostComputer'
    ];
    
    const hasEditor = editorTags.some(tag => exifData[tag]);
    const result = !hasEditor;
    
    if (!result) {
      console.log('🔍 Digital Transport Check - Editor marks found:', 
        editorTags.filter(tag => exifData[tag]).map(tag => `${tag}: ${exifData[tag]}`));
    }
    
    return result;
  }, [exifData]);

  const checkNeutralICC = useMemo(() => {
    if (!exifData) return false;
    
    const iccTags = Object.keys(exifData).filter(key => key.startsWith('ICC_Profile:'));
    const result = iccTags.length === 0;
    
    if (!result) {
      console.log('🔍 Digital Transport Check - ICC Profile found:', iccTags);
    }
    
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
    const criteriaMet = [
      checkCriticalExifMissing,
      check420Subsampling, 
      checkNoEditorMarks,
      checkNeutralICC
    ];
    
    const allCriteriaMet = criteriaMet.every(Boolean);
    const reinforcementCount = optionalReinforcements.length;
    const hasIntentionalEditing = hasIntentionalEditingIndicators;
    
    // Digital transport is only detected if all criteria are met, 
    // there are reinforcements, AND there are no intentional editing indicators
    const result = allCriteriaMet && reinforcementCount >= 1 && !hasIntentionalEditing;
    
    console.log('🔍 Digital Transport Final Check:');
    console.log('  - All criteria met:', allCriteriaMet);
    console.log('  - Reinforcements:', reinforcementCount, optionalReinforcements);
    console.log('  - Has intentional editing:', hasIntentionalEditing);
    console.log('  - Result (Digital Transport):', result);
    
    return result;
  }, [checkCriticalExifMissing, check420Subsampling, checkNoEditorMarks, checkNeutralICC, optionalReinforcements, hasIntentionalEditingIndicators]);

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
              <div className="text-xs text-yellow-600 mt-1">
                *Transporte digital detectado (ausência de EXIF crítico, subamostragem 4:2:0, ausência de software, ICC neutro, sem indicadores de edição intencional). Severidade limitada a Moderado.
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
            
            {/* Informação sobre arquivo original */}
            {isOriginalFile && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-800 font-medium">📷 Arquivo Original de Câmera Detectado</div>
                <div className="text-xs text-blue-600 mt-1">
                  Pontuação reduzida para indicadores comuns em arquivos originais
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
            {manipulationScore.indicators.map((indicator, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-sm text-red-800">{indicator}</span>
              </div>
            ))}
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