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

    // 1. EXIF ausente (peso 0) - Apenas condição booleana para outras regras
    const hasMake = exifData['EXIF:Make'] || exifData['IFD0:Make'];
    const hasModel = exifData['EXIF:Model'] || exifData['IFD0:Model'];
    const hasISO = exifData['EXIF:ISO'] || exifData['EXIF:RecommendedExposureIndex'] || exifData['EXIF:ISOSpeedRatings'];
    const hasCreateDate = exifData['EXIF:CreateDate'] || exifData['EXIF:DateTimeOriginal'];
    
    const missingEssentialExif = !hasMake || !hasModel || !hasISO || !hasCreateDate;
    // EXIF ausente não pontua mais - apenas usado como condição para outras regras

    // 2. Software explícito (peso 4) - Detectar tags de software de edição
    const softwareFields = [
      exifData['EXIF:Software'],
      exifData['EXIF:Creator'], 
      exifData['XMP:CreatorTool'],
      exifData['XMP:Software'],
      exifData['IFD0:Software']
    ].filter(Boolean);
    
    // Debug: Log dos campos de software encontrados
    console.log('Software fields encontrados:', softwareFields);
    console.log('Todos os campos EXIF disponíveis que contêm "Software" ou "Creator":', 
      Object.keys(exifData).filter(key => 
        key.toLowerCase().includes('software') || 
        key.toLowerCase().includes('creator') || 
        key.toLowerCase().includes('tool')
      ).map(key => `${key}: ${exifData[key]}`)
    );
    
    const editingSoftware = softwareFields.some(software => {
      const soft = software.toString().toLowerCase();
      console.log('Verificando software:', soft);
      return soft.includes('photoshop') || soft.includes('gimp') || 
             soft.includes('pixelmator') || soft.includes('canva') ||
             soft.includes('lightroom') || soft.includes('editor') ||
             soft.includes('paint') || soft.includes('sketch') ||
             soft.includes('photopea') || soft.includes('pixlr') ||
             soft.includes('fotor') || soft.includes('befunky');
    });
    
    if (editingSoftware) {
      score += 4;
      indicators.push('Software explícito');
      details.push('Software explícito (+4): Software de edição detectado nos metadados');
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

    // 7. ICC Profile HP/Adobe (peso 3)
    const iccDescription = exifData['ICC_Profile:ProfileDescription'] || exifData['EXIF:ColorSpace'] || 
                          exifData['ICC:ProfileDescription'] || exifData['ColorSpace'] ||
                          exifData['ICC_Profile:DeviceManufacturer'] || exifData['ICC:DeviceManufacturer'];
    
    const hasHPAdobe = iccDescription?.toString().toLowerCase().includes('hp') || 
                       iccDescription?.toString().toLowerCase().includes('adobe') ||
                       iccDescription?.toString().toLowerCase().includes('hewlett') ||
                       exifData['ICC_Profile:DeviceManufacturer']?.toString().toLowerCase().includes('adbe') ||
                       exifData['ICC_Profile:DeviceManufacturer']?.toString().toLowerCase().includes('hp');
    
    if (hasHPAdobe) {
      score += 3;
      indicators.push('ICC HP/Adobe');
      details.push('ICC HP/Adobe (+3): Perfil ICC HP/Adobe');
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
      missingEssentialExif
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

  // Determine digital transport pattern
  const isDigitalTransport = useMemo(() => {
    const hasNoEXIF = !(exifData['EXIF:Make'] && exifData['EXIF:Model']);
    const hasReduction = fileMetadata.size_bytes && fileMetadata.size_bytes < 200000; // < 200KB
    const has420Subsampling = (() => {
      const subsampling = exifData['JFIF:YCbCrSubSampling'] || exifData['EXIF:YCbCrSubSampling'];
      return subsampling === '2 2' || subsampling === '4:2:0' || 
             (typeof subsampling === 'string' && subsampling.includes('4:2:0'));
    })();
    const hasNoSoftware = !exifData['EXIF:Software'] && !exifData['XMP:CreatorTool'];
    
    return hasNoEXIF && hasReduction && has420Subsampling && hasNoSoftware;
  }, [exifData, fileMetadata]);

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
              <div className="text-xs text-yellow-600 mt-1">*Limitado por padrão de transporte digital</div>
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