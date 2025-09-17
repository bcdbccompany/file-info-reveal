import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, HardDrive, Hash, Image, MapPin, Camera, Palette, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import exifr from 'exifr';
import { fileTypeFromBuffer } from 'file-type';

interface FileMetadata {
  [key: string]: string | number | boolean | Date;
}

interface MetadataDisplayProps {
  file: File;
}

export default function MetadataDisplay({ file }: MetadataDisplayProps) {
  const [metadata, setMetadata] = useState<FileMetadata>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    extractAllMetadata();
  }, [file]);

  const formatValue = (value: any): string => {
    if (value instanceof Date) {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeStyle: 'medium'
      }).format(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'Sim' : 'Não';
    }
    if (typeof value === 'number') {
      if (value > 1024 && !value.toString().includes('.')) {
        return formatFileSize(value);
      }
      return value.toLocaleString('pt-BR');
    }
    return String(value);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const generateHash = async (buffer: ArrayBuffer, algorithm: string = 'SHA-256'): Promise<string> => {
    try {
      const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return 'Não disponível';
    }
  };

  const analyzeImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject('Não é imagem');
        return;
      }
      
      const img = document.createElement('img') as HTMLImageElement;
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject('Erro ao carregar imagem');
      };
      
      img.src = url;
    });
  };

  const extractAllMetadata = async () => {
    setIsLoading(true);
    const allMetadata: FileMetadata = {};

    try {
      // Metadados básicos do arquivo
      allMetadata['Nome do arquivo'] = file.name;
      allMetadata['Tamanho do arquivo'] = file.size;
      allMetadata['Tipo MIME original'] = file.type || 'Não especificado';
      allMetadata['Última modificação'] = new Date(file.lastModified);
      allMetadata['Data de criação do objeto'] = new Date();
      
      const extension = file.name.split('.').pop()?.toLowerCase();
      allMetadata['Extensão'] = extension || 'Sem extensão';
      allMetadata['Nome sem extensão'] = file.name.replace(/\.[^/.]+$/, '');
      
      if (extension) {
        allMetadata['Categoria'] = getCategoryFromExtension(extension);
      }

      // Análise do buffer do arquivo
      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      // Detecção de tipo real via magic numbers
      try {
        const detectedType = await fileTypeFromBuffer(uint8Array);
        if (detectedType) {
          allMetadata['Tipo detectado'] = detectedType.mime;
          allMetadata['Extensão detectada'] = detectedType.ext;
          allMetadata['Tipo corresponde'] = detectedType.mime === file.type ? 'Sim' : 'Não';
        }
      } catch (error) {
        allMetadata['Erro detecção tipo'] = 'Não foi possível detectar';
      }

      // Hashes criptográficos
      allMetadata['Hash SHA-256'] = await generateHash(buffer, 'SHA-256');
      allMetadata['Hash SHA-1'] = await generateHash(buffer, 'SHA-1');
      
      // Análise de entropy/randomness
      const entropy = calculateEntropy(uint8Array);
      allMetadata['Entropia (bits)'] = entropy.toFixed(4);
      allMetadata['Compressibilidade estimada'] = entropy > 7 ? 'Baixa' : entropy > 5 ? 'Média' : 'Alta';

      // Análise de bytes
      allMetadata['Primeiro byte (hex)'] = uint8Array[0]?.toString(16).padStart(2, '0').toUpperCase() || '00';
      allMetadata['Último byte (hex)'] = uint8Array[uint8Array.length - 1]?.toString(16).padStart(2, '0').toUpperCase() || '00';
      allMetadata['Bytes nulos'] = uint8Array.filter(b => b === 0).length;
      allMetadata['Bytes únicos'] = new Set(uint8Array).size;

      // Para imagens, extrair EXIF e dimensões
      if (file.type.startsWith('image/')) {
        try {
          const dimensions = await analyzeImageDimensions(file);
          allMetadata['Largura (pixels)'] = dimensions.width;
          allMetadata['Altura (pixels)'] = dimensions.height;
          allMetadata['Megapixels'] = ((dimensions.width * dimensions.height) / 1000000).toFixed(2);
          allMetadata['Proporção'] = (dimensions.width / dimensions.height).toFixed(2);
          allMetadata['Orientação'] = dimensions.width > dimensions.height ? 'Paisagem' : dimensions.height > dimensions.width ? 'Retrato' : 'Quadrada';
        } catch (error) {
          allMetadata['Erro dimensões'] = 'Não foi possível obter';
        }

        // EXIF data
        try {
          const exifData = await exifr.parse(file, true);
          if (exifData) {
            // Informações da câmera
            if (exifData.Make) allMetadata['Fabricante câmera'] = exifData.Make;
            if (exifData.Model) allMetadata['Modelo câmera'] = exifData.Model;
            if (exifData.Software) allMetadata['Software'] = exifData.Software;
            
            // Configurações da foto
            if (exifData.ISO) allMetadata['ISO'] = exifData.ISO;
            if (exifData.FNumber) allMetadata['Abertura'] = `f/${exifData.FNumber}`;
            if (exifData.ExposureTime) allMetadata['Tempo exposição'] = `${exifData.ExposureTime}s`;
            if (exifData.FocalLength) allMetadata['Distância focal'] = `${exifData.FocalLength}mm`;
            if (exifData.Flash) allMetadata['Flash'] = exifData.Flash > 0 ? 'Usado' : 'Não usado';
            
            // Data/hora
            if (exifData.DateTimeOriginal) allMetadata['Data original foto'] = new Date(exifData.DateTimeOriginal);
            if (exifData.CreateDate) allMetadata['Data criação'] = new Date(exifData.CreateDate);
            
            // GPS
            if (exifData.latitude && exifData.longitude) {
              allMetadata['Latitude'] = exifData.latitude.toFixed(6);
              allMetadata['Longitude'] = exifData.longitude.toFixed(6);
              allMetadata['Localização GPS'] = 'Disponível';
            }
            
            // Outras informações técnicas
            if (exifData.ColorSpace) allMetadata['Espaço de cor'] = exifData.ColorSpace;
            if (exifData.WhiteBalance) allMetadata['Balanço branco'] = exifData.WhiteBalance;
            if (exifData.ExposureMode) allMetadata['Modo exposição'] = exifData.ExposureMode;
            if (exifData.SceneCaptureType) allMetadata['Tipo cena'] = exifData.SceneCaptureType;
          }
        } catch (error) {
          allMetadata['EXIF'] = 'Não disponível ou erro';
        }
      }

      // Análise específica para diferentes tipos
      if (file.type.startsWith('text/') || extension === 'txt' || extension === 'csv') {
        try {
          const text = await file.text();
          allMetadata['Linhas de texto'] = text.split('\n').length;
          allMetadata['Caracteres'] = text.length;
          allMetadata['Palavras estimadas'] = text.split(/\s+/).filter(w => w.length > 0).length;
          allMetadata['Encoding detectado'] = detectTextEncoding(uint8Array);
        } catch (error) {
          allMetadata['Erro análise texto'] = 'Não foi possível analisar';
        }
      }

      // WebkitRelativePath
      if ('webkitRelativePath' in file && (file as any).webkitRelativePath) {
        allMetadata['Caminho relativo'] = (file as any).webkitRelativePath;
        allMetadata['Profundidade diretório'] = (file as any).webkitRelativePath.split('/').length - 1;
      }

      // Informações do sistema
      allMetadata['Timestamp Unix'] = Math.floor(file.lastModified / 1000);
      allMetadata['ID único sessão'] = generateSimpleHash(file.name + file.size + file.lastModified);

      setMetadata(allMetadata);
    } catch (error) {
      console.error('Erro ao extrair metadados:', error);
      setMetadata({ 'Erro': 'Falha na extração de metadados' });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateEntropy = (data: Uint8Array): number => {
    const frequencies: { [key: number]: number } = {};
    for (const byte of data) {
      frequencies[byte] = (frequencies[byte] || 0) + 1;
    }
    
    let entropy = 0;
    const length = data.length;
    for (const count of Object.values(frequencies)) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy;
  };

  const detectTextEncoding = (bytes: Uint8Array): string => {
    // BOM detection
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return 'UTF-8 com BOM';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return 'UTF-16 LE';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return 'UTF-16 BE';
    }
    
    // Simple heuristic for UTF-8 vs ASCII
    let hasHighBytes = false;
    for (let i = 0; i < Math.min(bytes.length, 1000); i++) {
      if (bytes[i] > 127) {
        hasHighBytes = true;
        break;
      }
    }
    
    return hasHighBytes ? 'Provavelmente UTF-8' : 'ASCII/UTF-8';
  };

  const getCategoryFromExtension = (ext: string): string => {
    const categories: { [key: string]: string } = {
      // Imagens
      jpg: 'Imagem', jpeg: 'Imagem', png: 'Imagem', gif: 'Imagem', webp: 'Imagem', svg: 'Imagem', bmp: 'Imagem',
      // Documentos
      pdf: 'Documento', doc: 'Documento', docx: 'Documento', txt: 'Documento', rtf: 'Documento',
      // Planilhas
      xls: 'Planilha', xlsx: 'Planilha', csv: 'Planilha',
      // Apresentações  
      ppt: 'Apresentação', pptx: 'Apresentação',
      // Áudio
      mp3: 'Áudio', wav: 'Áudio', flac: 'Áudio', aac: 'Áudio', ogg: 'Áudio',
      // Vídeo
      mp4: 'Vídeo', avi: 'Vídeo', mov: 'Vídeo', wmv: 'Vídeo', mkv: 'Vídeo',
      // Comprimidos
      zip: 'Arquivo Comprimido', rar: 'Arquivo Comprimido', '7z': 'Arquivo Comprimido',
      // Código
      js: 'Código', ts: 'Código', html: 'Código', css: 'Código', json: 'Código', xml: 'Código'
    };
    return categories[ext] || 'Outro';
  };

  const generateSimpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8).toUpperCase();
  };

  const getIconForKey = (key: string) => {
    if (key.toLowerCase().includes('nome') || key.toLowerCase().includes('extensão')) {
      return <FileText className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('data') || key.toLowerCase().includes('modificação')) {
      return <Calendar className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('tamanho')) {
      return <HardDrive className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('hash')) {
      return <Hash className="h-4 w-4" />;
    }
    return null;
  };

  const metadataEntries = Object.entries(metadata);

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl shadow-card bg-gradient-card">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Analisando Metadados...
          </CardTitle>
          <p className="text-muted-foreground">
            Extraindo todos os metadados disponíveis do arquivo
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl shadow-card bg-gradient-card">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Metadados do Arquivo
        </CardTitle>
        <p className="text-muted-foreground">
          Informações detalhadas sobre o arquivo selecionado
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {metadataEntries.map(([key, value], index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {getIconForKey(key) && (
                  <div className="text-primary">
                    {getIconForKey(key)}
                  </div>
                )}
                <span className="font-medium text-foreground">{key}</span>
              </div>
              <div className="flex items-center gap-2">
                {key === 'Categoria' ? (
                  <Badge variant="secondary" className="text-xs">
                    {formatValue(value)}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground font-mono text-sm max-w-xs text-right truncate">
                    {formatValue(value)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground text-center">
            Total de metadados encontrados: <span className="font-semibold text-foreground">{metadataEntries.length}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}