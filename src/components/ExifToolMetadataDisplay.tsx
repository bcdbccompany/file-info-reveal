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

  // Manipulation Detection Score - calculates suspicion points based on forensic validation matrix
  const manipulationScore = useMemo(() => {
    let score = 0;
    const detectedIndicators: string[] = [];
    
    // 1. File Size (1 point - Weak indicator)
    // Check if file size is significantly larger than expected for its dimensions
    const width = exifData['EXIF:ExifImageWidth'] || exifData['File:ImageWidth'] || exifData['EXIF:ImageWidth'];
    const height = exifData['EXIF:ExifImageHeight'] || exifData['File:ImageHeight'] || exifData['EXIF:ImageHeight'];
    const actualSize = fileMetadata.size_bytes;
    
    if (width && height && actualSize) {
      // Calculate expected size: width × height × 3 (RGB) × compression factor (0.1-0.3 for JPEG)
      const expectedSize = width * height * 0.2; // Conservative estimate for typical JPEG compression
      if (actualSize > expectedSize * 1.5) { // 50% larger than expected indicates high quality/reprocessing
        score += 1;
        detectedIndicators.push('Tamanho de arquivo (aumento relevante)');
      }
    }
    
    // 2. Progressive DCT Encoding (3 points - Medium indicator)
    const progressiveIndicators = [
      exifData['JFIF:ProgressiveDCT'],
      exifData['File:EncodingProcess']?.includes?.('Progressive'),
      exifData['EXIF:ColorSpace'] === 'Uncalibrated' // Often appears with progressive
    ];
    if (progressiveIndicators.some(Boolean)) {
      score += 3;
      detectedIndicators.push('Codificação Progressive DCT');
    }
    
    // 3. YCbCr 4:4:4 Color Subsampling (3 points - Medium indicator)
    const subsampling = exifData['JFIF:YCbCrSubSampling'] || exifData['File:YCbCrSubSampling'] || exifData['EXIF:YCbCrSubSampling'];
    if (subsampling === '1 1' || subsampling === '4:4:4' || 
        (typeof subsampling === 'string' && subsampling.includes('4:4:4'))) {
      score += 3;
      detectedIndicators.push('Subamostragem de cor 4:4:4');
    }
    
    // 4. ICC Profiles - HP/Adobe/Missing (3 points - Medium indicator)
    const iccProfile = exifData['ICC_Profile:ProfileDescription'] || exifData['ICC_Profile:ColorSpaceData'] || 
                      exifData['ICC-header:DeviceManufacturer'] || exifData['ICC:DeviceManufacturer'];
    if (iccProfile) {
      if (iccProfile.includes('HP') || iccProfile.includes('Hewlett') || iccProfile === 'Hewlett-Packard') {
        score += 3;
        detectedIndicators.push('Perfil ICC HP');
      } else if (iccProfile.includes('Adobe') || iccProfile.includes('Photoshop')) {
        score += 3;
        detectedIndicators.push('Perfil ICC Adobe/Photoshop');
      }
    } else if (!iccProfile && Object.keys(exifData).some(key => key.startsWith('ICC'))) {
      score += 3;
      detectedIndicators.push('Perfil ICC ausente/genérico');
    }
    
    // 5. Missing EXIF Camera Data (4 points - Strong indicator)
    const hasBasicCameraData = exifData['EXIF:Make'] && exifData['EXIF:Model'] && 
                              (exifData['EXIF:ISO'] || exifData['EXIF:ISOSpeedRatings']);
    if (!hasBasicCameraData) {
      score += 4;
      detectedIndicators.push('EXIF de câmera ausente');
    }
    
    // 6. Adobe/Photoshop Tags (3 points - Medium indicator)
    const adobeTags = [
      exifData['Photoshop:PhotoshopQuality'],
      exifData['Photoshop:ProgressiveScans'],
      exifData['Adobe:DCTEncodeVersion'],
      exifData['Adobe:APP14Flags0'],
      exifData['Adobe:ColorTransform'],
      exifData['APP14:DCTEncodeVersion'],
      exifData['XMP:CreatorTool']?.includes?.('Adobe'),
      exifData['XMP:CreatorTool']?.includes?.('Photoshop')
    ];
    if (adobeTags.some(Boolean)) {
      score += 3;
      detectedIndicators.push('Tags Adobe/Photoshop');
    }
    
    // 7. Thumbnail alterada (1 point - Weak indicator)
    const thumbnailLength = exifData['EXIF:ThumbnailLength'];
    if (thumbnailLength && width && height) {
      // Expected thumbnail size for given dimensions (rough estimate)
      const expectedThumbnailSize = Math.min(160, width) * Math.min(120, height) * 0.1;
      if (thumbnailLength > expectedThumbnailSize * 2) {
        score += 1;
        detectedIndicators.push('Thumbnail alterada');
      }
    }
    
    // 8. Explicit Software Field (4 points - Strong indicator)
    const softwareField = exifData['EXIF:Software'] || exifData['XMP:CreatorTool'];
    if (softwareField && !softwareField.match(/^[A-Z]+\s*[0-9.]+$/)) { // Not camera firmware pattern
      const suspiciousSoftware = ['Photoshop', 'Photopea', 'Canva', 'Pixlr', 'Fotor', 'BeFunky', 'GIMP'];
      if (suspiciousSoftware.some(sw => softwareField.includes(sw))) {
        score += 4;
        detectedIndicators.push(`Software explícito: ${softwareField}`);
      }
    }
    
    // 8. Inconsistent Dates (3 points - Medium indicator) 
    const dateOriginal = exifData['EXIF:DateTimeOriginal'];
    const dateModify = exifData['EXIF:ModifyDate'] || exifData['XMP:ModifyDate'];
    const dateCreate = exifData['EXIF:CreateDate'];
    
    if (dateOriginal && dateModify) {
      const origDate = new Date(dateOriginal.replace(/:/g, '-', 2));
      const modDate = new Date(dateModify.replace(/:/g, '-', 2));
      const timeDiff = Math.abs(modDate.getTime() - origDate.getTime()) / (1000 * 60 * 60); // hours
      
      if (timeDiff > 24) { // More than 24 hours difference
        score += 3;
        detectedIndicators.push('Datas inconsistentes (>24h diferença)');
      }
    }
    
    return { score, indicators: detectedIndicators };
  }, [exifData, fileMetadata]);

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

  // Co-occurrence bonuses for manipulation patterns
  const cooccurrenceBonus = useMemo(() => {
    let bonus = 0;
    const appliedBonuses: string[] = [];
    
    // Get indicators for bonus calculations
    const hasProgressive = exifData['JFIF:ProgressiveDCT'] || 
                          exifData['File:EncodingProcess']?.includes?.('Progressive');
    const has444Subsampling = (() => {
      const subsampling = exifData['JFIF:YCbCrSubSampling'] || exifData['File:YCbCrSubSampling'] || exifData['EXIF:YCbCrSubSampling'];
      return subsampling === '1 1' || subsampling === '4:4:4' || 
             (typeof subsampling === 'string' && subsampling.includes('4:4:4'));
    })();
    const hasHPICC = (() => {
      const iccProfile = exifData['ICC_Profile:ProfileDescription'] || exifData['ICC_Profile:ColorSpaceData'] || 
                        exifData['ICC-header:DeviceManufacturer'] || exifData['ICC:DeviceManufacturer'];
      return iccProfile && (iccProfile.includes('HP') || iccProfile.includes('Hewlett') || iccProfile === 'Hewlett-Packard');
    })();
    const hasAdobeICC = (() => {
      const iccProfile = exifData['ICC_Profile:ProfileDescription'] || exifData['ICC_Profile:ColorSpaceData'];
      return iccProfile && (iccProfile.includes('Adobe') || iccProfile.includes('Photoshop'));
    })();
    const hasAdobeTags = [
      exifData['Photoshop:PhotoshopQuality'],
      exifData['Photoshop:ProgressiveScans'], 
      exifData['Adobe:DCTEncodeVersion'],
      exifData['Adobe:APP14Flags0'],
      exifData['Adobe:ColorTransform'],
      exifData['APP14:DCTEncodeVersion'],
      exifData['XMP:CreatorTool']?.includes?.('Adobe'),
      exifData['XMP:CreatorTool']?.includes?.('Photoshop')
    ].some(Boolean);
    const hasInconsistentDates = (() => {
      const dateOriginal = exifData['EXIF:DateTimeOriginal'];
      const dateModify = exifData['EXIF:ModifyDate'] || exifData['XMP:ModifyDate'];
      if (dateOriginal && dateModify) {
        const origDate = new Date(dateOriginal.replace(/:/g, '-', 2));
        const modDate = new Date(dateModify.replace(/:/g, '-', 2));
        const timeDiff = Math.abs(modDate.getTime() - origDate.getTime()) / (1000 * 60 * 60);
        return timeDiff > 24;
      }
      return false;
    })();
    const hasResizing = (() => {
      // Check if resolution is non-standard or if there are resize indicators
      const width = exifData['EXIF:ExifImageWidth'] || exifData['File:ImageWidth'];
      const height = exifData['EXIF:ExifImageHeight'] || exifData['File:ImageHeight'];
      if (width && height) {
        // Common camera resolutions: 1920x1080, 4032x3024, etc.
        const commonRatios = [16/9, 4/3, 3/2, 1/1];
        const ratio = width / height;
        const isStandardRatio = commonRatios.some(r => Math.abs(ratio - r) < 0.01);
        return !isStandardRatio || (width % 16 !== 0) || (height % 16 !== 0);
      }
      return false;
    })();
    const hasPreservedEXIF = exifData['EXIF:Make'] && exifData['EXIF:Model'];
    const hasC2PA = Object.keys(exifData).some(key => 
      key.includes('C2PA') || key.includes('JUMBF') || key.includes('Manifest'));
    
    // Bonus 1: Progressive DCT + YCbCr 4:4:4 Subsampling (+2 points)
    if (hasProgressive && has444Subsampling) {
      bonus += 2;
      appliedBonuses.push('Progressive DCT + Subamostragem 4:4:4 (+2)');
    }
    
    // Bonus 2: ICC HP + Progressive (+2 points)
    if (hasHPICC && hasProgressive) {
      bonus += 2;
      appliedBonuses.push('ICC HP + Progressive (+2)');
    }
    
    // Bonus 3: ICC Adobe + Adobe Tags (+2 points)  
    if (hasAdobeICC && hasAdobeTags) {
      bonus += 2;
      appliedBonuses.push('ICC Adobe + Tags Adobe (+2)');
    }
    
    // Bonus 4: Inconsistent dates + (Progressive/4:4:4 OR ICC+Adobe) (+2 points)
    if (hasInconsistentDates && ((hasProgressive || has444Subsampling) || (hasAdobeICC && hasAdobeTags))) {
      bonus += 2;
      appliedBonuses.push('Datas inconsistentes + padrão de edição (+2)');
    }
    
    // Bonus 5: Resizing + (Progressive OR 4:4:4) (+2 points)
    if (hasResizing && (hasProgressive || has444Subsampling)) {
      bonus += 2;
      appliedBonuses.push('Redimensionamento + reprocessamento (+2)');
    }
    
    // Bonus 6: Preserved EXIF + C2PA AI (+5 points)
    if (hasPreservedEXIF && hasC2PA) {
      bonus += 5;
      appliedBonuses.push('EXIF preservado + C2PA IA (+5)');
    }
    
    return { total: bonus, applied: appliedBonuses };
  }, [exifData]);

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

  // Classification based on final score
  const classification = useMemo(() => {
    if (adjustedScore <= 3) return { level: 'Baixo', description: 'Normal', color: 'text-green-600', bgColor: 'bg-green-50' };
    if (adjustedScore <= 7) return { level: 'Moderado', description: 'Suspeita moderada', color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
    if (adjustedScore <= 12) return { level: 'Forte', description: 'Suspeito', color: 'text-orange-600', bgColor: 'bg-orange-50' };
    return { level: 'Muito Forte', description: 'Provável fraude', color: 'text-red-600', bgColor: 'bg-red-50' };
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