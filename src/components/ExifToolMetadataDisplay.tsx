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

  // Validation matrix-based metadata score calculation
  const metadataScore = useMemo(() => {
    let score = 0;
    const validationMatrix = {
      // Categoria 1: Integridade do Arquivo (25 pontos)
      fileIntegrity: {
        fileName: fileMetadata.file_name ? 5 : 0,
        mimeType: fileMetadata.mime_type ? 5 : 0,
        fileSize: fileMetadata.size_bytes ? 5 : 0,
        basicStructure: Object.keys(exifData).length > 0 ? 10 : 0,
      },
      
      // Categoria 2: Dados de Origem (25 pontos)
      originData: {
        cameraManufacturer: exifData['EXIF:Make'] ? 8 : 0,
        cameraModel: exifData['EXIF:Model'] ? 8 : 0,
        softwareUsed: (exifData['EXIF:Software'] || exifData['XMP:CreatorTool']) ? 9 : 0,
      },
      
      // Categoria 3: Dados Temporais (20 pontos)
      temporalData: {
        dateTimeOriginal: exifData['EXIF:DateTimeOriginal'] ? 8 : 0,
        dateTime: exifData['EXIF:DateTime'] ? 4 : 0,
        dateTimeDigitized: exifData['EXIF:DateTimeDigitized'] ? 4 : 0,
        modifyDate: (exifData['EXIF:ModifyDate'] || exifData['XMP:ModifyDate']) ? 4 : 0,
      },
      
      // Categoria 4: Parâmetros Técnicos (15 pontos)
      technicalParams: {
        resolution: (exifData['EXIF:ExifImageWidth'] && exifData['EXIF:ExifImageHeight']) ? 4 : 0,
        iso: (exifData['EXIF:ISO'] || exifData['EXIF:ISOSpeedRatings']) ? 3 : 0,
        aperture: (exifData['EXIF:FNumber'] || exifData['EXIF:ApertureValue']) ? 4 : 0,
        exposureTime: (exifData['EXIF:ExposureTime'] || exifData['EXIF:ShutterSpeedValue']) ? 4 : 0,
      },
      
      // Categoria 5: Dados de Localização (10 pontos)
      locationData: {
        gpsCoordinates: (exifData['GPS:GPSLatitude'] && exifData['GPS:GPSLongitude']) ? 10 : 0,
      },
      
      // Categoria 6: Validação Cruzada (5 pontos)
      crossValidation: {
        consistencyCheck: (() => {
          const hasDateTime = exifData['EXIF:DateTimeOriginal'];
          const hasCamera = exifData['EXIF:Make'] && exifData['EXIF:Model'];
          const hasTechnical = (exifData['EXIF:ISO'] || exifData['EXIF:FNumber']);
          
          if (hasDateTime && hasCamera && hasTechnical) return 5;
          if ((hasDateTime && hasCamera) || (hasCamera && hasTechnical)) return 3;
          if (hasDateTime || hasCamera || hasTechnical) return 1;
          return 0;
        })(),
      }
    };

    // Calculate total score from validation matrix
    Object.values(validationMatrix).forEach(category => {
      Object.values(category).forEach(points => {
        score += points;
      });
    });

    return Math.min(score, 100);
  }, [exifData, fileMetadata]);

  // Generate detailed validation report
  const validationReport = useMemo(() => {
    const report = {
      categories: [
        {
          name: 'Integridade do Arquivo',
          score: (fileMetadata.file_name ? 5 : 0) + (fileMetadata.mime_type ? 5 : 0) + 
                 (fileMetadata.size_bytes ? 5 : 0) + (Object.keys(exifData).length > 0 ? 10 : 0),
          maxScore: 25,
          items: [
            { name: 'Nome do arquivo', present: !!fileMetadata.file_name, points: 5 },
            { name: 'Tipo MIME', present: !!fileMetadata.mime_type, points: 5 },
            { name: 'Tamanho do arquivo', present: !!fileMetadata.size_bytes, points: 5 },
            { name: 'Estrutura básica', present: Object.keys(exifData).length > 0, points: 10 },
          ]
        },
        {
          name: 'Dados de Origem',
          score: (exifData['EXIF:Make'] ? 8 : 0) + (exifData['EXIF:Model'] ? 8 : 0) + 
                 ((exifData['EXIF:Software'] || exifData['XMP:CreatorTool']) ? 9 : 0),
          maxScore: 25,
          items: [
            { name: 'Fabricante da câmera', present: !!exifData['EXIF:Make'], points: 8 },
            { name: 'Modelo da câmera', present: !!exifData['EXIF:Model'], points: 8 },
            { name: 'Software utilizado', present: !!(exifData['EXIF:Software'] || exifData['XMP:CreatorTool']), points: 9 },
          ]
        },
        {
          name: 'Dados Temporais',
          score: (exifData['EXIF:DateTimeOriginal'] ? 8 : 0) + (exifData['EXIF:DateTime'] ? 4 : 0) + 
                 (exifData['EXIF:DateTimeDigitized'] ? 4 : 0) + ((exifData['EXIF:ModifyDate'] || exifData['XMP:ModifyDate']) ? 4 : 0),
          maxScore: 20,
          items: [
            { name: 'Data/hora original', present: !!exifData['EXIF:DateTimeOriginal'], points: 8 },
            { name: 'Data/hora de modificação', present: !!exifData['EXIF:DateTime'], points: 4 },
            { name: 'Data/hora de digitalização', present: !!exifData['EXIF:DateTimeDigitized'], points: 4 },
            { name: 'Data de última modificação', present: !!(exifData['EXIF:ModifyDate'] || exifData['XMP:ModifyDate']), points: 4 },
          ]
        },
        {
          name: 'Parâmetros Técnicos',
          score: ((exifData['EXIF:ExifImageWidth'] && exifData['EXIF:ExifImageHeight']) ? 4 : 0) + 
                 ((exifData['EXIF:ISO'] || exifData['EXIF:ISOSpeedRatings']) ? 3 : 0) +
                 ((exifData['EXIF:FNumber'] || exifData['EXIF:ApertureValue']) ? 4 : 0) +
                 ((exifData['EXIF:ExposureTime'] || exifData['EXIF:ShutterSpeedValue']) ? 4 : 0),
          maxScore: 15,
          items: [
            { name: 'Resolução da imagem', present: !!(exifData['EXIF:ExifImageWidth'] && exifData['EXIF:ExifImageHeight']), points: 4 },
            { name: 'ISO/Sensibilidade', present: !!(exifData['EXIF:ISO'] || exifData['EXIF:ISOSpeedRatings']), points: 3 },
            { name: 'Abertura/F-number', present: !!(exifData['EXIF:FNumber'] || exifData['EXIF:ApertureValue']), points: 4 },
            { name: 'Tempo de exposição', present: !!(exifData['EXIF:ExposureTime'] || exifData['EXIF:ShutterSpeedValue']), points: 4 },
          ]
        },
        {
          name: 'Dados de Localização',
          score: (exifData['GPS:GPSLatitude'] && exifData['GPS:GPSLongitude']) ? 10 : 0,
          maxScore: 10,
          items: [
            { name: 'Coordenadas GPS', present: !!(exifData['GPS:GPSLatitude'] && exifData['GPS:GPSLongitude']), points: 10 },
          ]
        },
        {
          name: 'Validação Cruzada',
          score: (() => {
            const hasDateTime = exifData['EXIF:DateTimeOriginal'];
            const hasCamera = exifData['EXIF:Make'] && exifData['EXIF:Model'];
            const hasTechnical = (exifData['EXIF:ISO'] || exifData['EXIF:FNumber']);
            
            if (hasDateTime && hasCamera && hasTechnical) return 5;
            if ((hasDateTime && hasCamera) || (hasCamera && hasTechnical)) return 3;
            if (hasDateTime || hasCamera || hasTechnical) return 1;
            return 0;
          })(),
          maxScore: 5,
          items: [
            { name: 'Consistência entre metadados', present: true, points: 'Variável (1-5)' },
          ]
        }
      ]
    };
    
    return report;
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


  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const downloadMetadata = () => {
    const dataStr = JSON.stringify({ 
      fileInfo: fileMetadata,
      exifData: exifData,
      organizedData: organizedMetadata 
    }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `metadata_${fileMetadata.file_name || 'arquivo'}.json`;
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

      {/* Validation Matrix Score Section */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Matriz de Validação Forense</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Análise baseada em critérios de validação para evidências digitais
            </p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${metadataScore >= 80 ? 'text-green-500' : metadataScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
              {metadataScore}/100
            </div>
            <div className="text-sm text-muted-foreground">
              {metadataScore >= 80 ? 'ALTA CONFIABILIDADE' : 
               metadataScore >= 60 ? 'CONFIABILIDADE MÉDIA' : 
               'BAIXA CONFIABILIDADE'}
            </div>
          </div>
        </div>

        <div className="w-full bg-muted rounded-full h-4 mb-6">
          <div 
            className={`h-4 rounded-full transition-all duration-500 ${metadataScore >= 80 ? 'bg-green-500' : metadataScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${metadataScore}%` }}
          />
        </div>

        {/* Detailed validation categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {validationReport.categories.map((category) => (
            <div key={category.name} className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-foreground text-sm">{category.name}</h4>
                <span className={`text-sm font-bold ${category.score === category.maxScore ? 'text-green-500' : category.score > category.maxScore * 0.6 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {category.score}/{category.maxScore}
                </span>
              </div>
              <div className="w-full bg-muted-foreground/20 rounded-full h-2 mb-3">
                <div 
                  className={`h-2 rounded-full ${category.score === category.maxScore ? 'bg-green-500' : category.score > category.maxScore * 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${(category.score / category.maxScore) * 100}%` }}
                />
              </div>
              <div className="space-y-1">
                {category.items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <span className={item.present ? 'text-foreground' : 'text-muted-foreground'}>
                      {item.present ? '✓' : '✗'} {item.name}
                    </span>
                    <span className="text-muted-foreground">({item.points})</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">Resumo do Arquivo</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="bg-muted/30 rounded-lg p-3">
              <div className="font-medium text-sm text-muted-foreground mb-1">{key}</div>
              <div className="text-sm text-foreground">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata Sections */}
      <div className="bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <Accordion type="multiple" className="space-y-0">
          {renderMetadataGroup(organizedMetadata.file, "Informações do Arquivo", <FileText className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.exif, "Dados EXIF", <Camera className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.gps, "Localização GPS", <MapPin className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.icc, "Perfil de Cores", <Palette className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.adobe, "Adobe/Photoshop", <ImageIcon className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.composite, "Dados Compostos", <FileText className="h-5 w-5 text-primary" />)}
          {renderMetadataGroup(organizedMetadata.other, "Outros Metadados", <FileText className="h-5 w-5 text-primary" />)}
          
          {/* Raw JSON */}
          <AccordionItem value="raw-json" className="border border-border rounded-lg">
            <AccordionTrigger className="flex items-center gap-3 px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-left">JSON Bruto</h3>
                  <p className="text-sm text-muted-foreground text-left">Dados completos da API</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="bg-muted/30 rounded-lg p-4">
                <pre className="text-xs text-foreground overflow-auto max-h-96">
                  {JSON.stringify(exifData, null, 2)}
                </pre>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}