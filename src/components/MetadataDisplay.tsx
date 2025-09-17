import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, HardDrive, Hash, Image, MapPin, Camera, Palette, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface FileMetadata {
  [key: string]: string | number | boolean | Date;
}

interface ScoreRule {
  name: string;
  description: string;
  points: number;
  passed: boolean;
  reason?: string;
}

interface ScoreResult {
  totalScore: number;
  rules: ScoreRule[];
  riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Muito Alto';
}

interface MetadataDisplayProps {
  file: File;
}

export default function MetadataDisplay({ file }: MetadataDisplayProps) {
  const [metadata, setMetadata] = useState<FileMetadata>({});
  const [isLoading, setIsLoading] = useState(true);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);

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

  const extractExifData = async (buffer: ArrayBuffer): Promise<{ [key: string]: any }> => {
    const exifData: { [key: string]: any } = {};
    const dataView = new DataView(buffer);
    
    try {
      // Verificar se é JPEG
      if (dataView.getUint16(0) !== 0xFFD8) {
        return exifData;
      }

      let offset = 2;
      while (offset < dataView.byteLength - 10) {
        const marker = dataView.getUint16(offset);
        
        if (marker === 0xFFE1) { // APP1 segment (EXIF)
          const segmentLength = dataView.getUint16(offset + 2);
          const segmentStart = offset + 4;
          
          // Verificar cabeçalho EXIF
          if (segmentStart + 10 < dataView.byteLength &&
              dataView.getUint32(segmentStart) === 0x45786966 && 
              dataView.getUint16(segmentStart + 4) === 0x0000) {
            
            const tiffStart = segmentStart + 6;
            if (tiffStart + 8 < dataView.byteLength) {
              const byteOrder = dataView.getUint16(tiffStart);
              const littleEndian = byteOrder === 0x4949;
              
              exifData['Byte Order'] = littleEndian ? 'Little-endian (Intel)' : 'Big-endian (Motorola)';
              
              const ifdOffset = littleEndian ? 
                dataView.getUint32(tiffStart + 4, true) : 
                dataView.getUint32(tiffStart + 4, false);
              
              // Ler IFD0 com validação
              if (tiffStart + ifdOffset + 2 < dataView.byteLength) {
                parseIFD(dataView, tiffStart + ifdOffset, tiffStart, littleEndian, exifData, new Set());
              }
            }
          }
          
          break;
        }
        
        // Pular para próximo segment
        if (marker >= 0xFFC0 && marker <= 0xFFCF && marker !== 0xFFC4 && marker !== 0xFFC8) {
          break;
        }
        
        const segmentLength = dataView.getUint16(offset + 2);
        if (segmentLength < 2 || offset + segmentLength >= dataView.byteLength) break;
        offset += 2 + segmentLength;
      }
      
    } catch (error) {
      console.warn('Erro ao extrair EXIF:', error);
    }
    
    return exifData;
  };

  const parseIFD = (dataView: DataView, ifdOffset: number, tiffStart: number, littleEndian: boolean, exifData: any, visitedOffsets: Set<number>) => {
    try {
      // Prevenir recursão infinita
      if (visitedOffsets.has(ifdOffset) || ifdOffset < 0 || ifdOffset + 2 > dataView.byteLength) {
        return;
      }
      visitedOffsets.add(ifdOffset);

      const numEntries = littleEndian ? 
        dataView.getUint16(ifdOffset, true) : 
        dataView.getUint16(ifdOffset, false);

      // Validar número de entradas
      if (numEntries > 200 || ifdOffset + 2 + (numEntries * 12) > dataView.byteLength) {
        return;
      }

      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdOffset + 2 + (i * 12);
        
        if (entryOffset + 12 > dataView.byteLength) break;
        
        const tag = littleEndian ? 
          dataView.getUint16(entryOffset, true) : 
          dataView.getUint16(entryOffset, false);
        
        const type = littleEndian ? 
          dataView.getUint16(entryOffset + 2, true) : 
          dataView.getUint16(entryOffset + 2, false);
        
        const count = littleEndian ? 
          dataView.getUint32(entryOffset + 4, true) : 
          dataView.getUint32(entryOffset + 4, false);

        // Tags EXIF expandidos
        const tagNames: { [key: number]: string } = {
          0x010F: 'Make',
          0x0110: 'Model', 
          0x0112: 'Orientation',
          0x011A: 'XResolution',
          0x011B: 'YResolution',
          0x0128: 'ResolutionUnit',
          0x0131: 'Software',
          0x0132: 'ModifyDate',
          0x0213: 'YCbCrPositioning',
          0x829A: 'ExposureTime',
          0x829D: 'FNumber',
          0x8822: 'ExposureProgram',
          0x8827: 'ISO',
          0x9000: 'ExifVersion',
          0x9003: 'DateTimeOriginal',
          0x9004: 'CreateDate',
          0x9101: 'ComponentsConfiguration',
          0x9207: 'MeteringMode',
          0x9209: 'Flash',
          0x920A: 'FocalLength',
          0x9286: 'UserComment',
          0xA000: 'FlashPixVersion',
          0xA001: 'ColorSpace',
          0xA002: 'ExifImageWidth',
          0xA003: 'ExifImageHeight',
          0xA402: 'ExposureMode',
          0xA403: 'WhiteBalance',
          0xA406: 'SceneCaptureType',
          0x8769: 'ExifIFDOffset',
          0x8825: 'GPSInfoOffset'
        };

        const tagName = tagNames[tag] || `Tag_0x${tag.toString(16).toUpperCase()}`;
        
        try {
          let value = readTagValue(dataView, entryOffset + 8, type, count, tiffStart, littleEndian);
          
          // Formatações especiais
          if (tag === 0x0112 && typeof value === 'number') {
            const orientations = ['', 'Rotate 0°', 'Rotate 180°', 'Rotate 180°', 'Rotate 180°', 'Rotate 270° CW', 'Rotate 90° CW', 'Rotate 270° CCW', 'Rotate 90° CCW'];
            value = orientations[value] || `Orientation ${value}`;
          } else if (tag === 0x8822 && typeof value === 'number') {
            const programs = ['Not Defined', 'Manual', 'Program AE', 'Aperture Priority', 'Shutter Priority', 'Creative', 'Action', 'Portrait', 'Landscape'];
            value = programs[value] || `Program ${value}`;
          } else if (tag === 0x9207 && typeof value === 'number') {
            const meteringModes = ['Unknown', 'Average', 'Center-weighted average', 'Spot', 'Multi-spot', 'Multi-segment', 'Partial'];
            value = meteringModes[value] || `Metering ${value}`;
          } else if (tag === 0x9209 && typeof value === 'number') {
            value = (value & 1) ? 'Flash' : 'No Flash';
          } else if (tag === 0xA001 && typeof value === 'number') {
            value = value === 1 ? 'sRGB' : value === 65535 ? 'Uncalibrated' : `ColorSpace ${value}`;
          } else if (tag === 0x9101 && typeof value === 'string') {
            // ComponentsConfiguration para detectar YCbCr
            if (value.includes('1') && value.includes('2') && value.includes('3')) {
              exifData['YCbCrSubSampling'] = 'YCbCr4:2:0';
            }
          }
          
          exifData[tagName] = value;
          
          // Processar sub-IFDs
          if (tag === 0x8769 && typeof value === 'number') { // EXIF SubIFD
            const exifIfdOffset = tiffStart + value;
            if (exifIfdOffset + 2 <= dataView.byteLength && !visitedOffsets.has(exifIfdOffset)) {
              parseIFD(dataView, exifIfdOffset, tiffStart, littleEndian, exifData, new Set(visitedOffsets));
            }
          }
          
        } catch (e) {
          // Ignorar tags problemáticas
        }
      }
      
    } catch (error) {
      console.warn('Erro ao parsear IFD:', error);
    }
  };

  const readTagValue = (dataView: DataView, offset: number, type: number, count: number, tiffStart: number, littleEndian: boolean): any => {
    let valueOffset = offset;
    
    // Se o valor for maior que 4 bytes, está armazenado em outro local
    if (getTypeSize(type) * count > 4) {
      valueOffset = tiffStart + (littleEndian ? dataView.getUint32(offset, true) : dataView.getUint32(offset, false));
    }
    
    switch (type) {
      case 1: // BYTE
        return dataView.getUint8(valueOffset);
      case 2: // ASCII
        let str = '';
        for (let i = 0; i < count - 1; i++) {
          const char = dataView.getUint8(valueOffset + i);
          if (char === 0) break;
          str += String.fromCharCode(char);
        }
        return str;
      case 3: // SHORT
        return littleEndian ? dataView.getUint16(valueOffset, true) : dataView.getUint16(valueOffset, false);
      case 4: // LONG
        return littleEndian ? dataView.getUint32(valueOffset, true) : dataView.getUint32(valueOffset, false);
      case 5: // RATIONAL
        const numerator = littleEndian ? dataView.getUint32(valueOffset, true) : dataView.getUint32(valueOffset, false);
        const denominator = littleEndian ? dataView.getUint32(valueOffset + 4, true) : dataView.getUint32(valueOffset + 4, false);
        return denominator === 0 ? 0 : numerator / denominator;
      case 7: // UNDEFINED
        return `(Binary data ${count} bytes)`;
      case 9: // SLONG
        return littleEndian ? dataView.getInt32(valueOffset, true) : dataView.getInt32(valueOffset, false);
      case 10: // SRATIONAL
        const sNumerator = littleEndian ? dataView.getInt32(valueOffset, true) : dataView.getInt32(valueOffset, false);
        const sDenominator = littleEndian ? dataView.getInt32(valueOffset + 4, true) : dataView.getInt32(valueOffset + 4, false);
        return sDenominator === 0 ? 0 : sNumerator / sDenominator;
      default:
        return `(Tipo desconhecido ${type})`;
    }
  };

  const getTypeSize = (type: number): number => {
    const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
    return sizes[type] || 1;
  };

  const analyzeColorProfile = (buffer: ArrayBuffer): { [key: string]: any } => {
    const profileData: { [key: string]: any } = {};
    const dataView = new DataView(buffer);
    
    try {
      // Procurar por perfil ICC embedded e dados de cor em JPEG
      let offset = 0;
      
      // Primeiro, procurar por segmentos JPEG APP2 (perfil ICC)
      if (dataView.getUint16(0) === 0xFFD8) { // JPEG
        offset = 2;
        while (offset < dataView.byteLength - 10) {
          const marker = dataView.getUint16(offset);
          
          if (marker === 0xFFE2) { // APP2 - geralmente contém perfil ICC
            const segmentLength = dataView.getUint16(offset + 2);
            const segmentStart = offset + 4;
            
            // Verificar assinatura ICC
            if (segmentStart + 12 < dataView.byteLength) {
              const iccHeader = new Uint8Array(buffer, segmentStart, 12);
              const iccString = String.fromCharCode(...iccHeader);
              
              if (iccString.includes('ICC_PROFILE')) {
                profileData['ICC Profile'] = 'Embedded';
                
                // Tentar extrair informações do perfil
                const profileStart = segmentStart + 14;
                if (profileStart + 128 < dataView.byteLength) {
                  // Ler cabeçalho do perfil ICC
                  const profileSize = dataView.getUint32(profileStart);
                  profileData['Profile Size'] = `${profileSize} bytes`;
                  
                  // Device class (offset 12 no perfil ICC)
                  if (profileStart + 15 < dataView.byteLength) {
                    const deviceClass = String.fromCharCode(
                      dataView.getUint8(profileStart + 12),
                      dataView.getUint8(profileStart + 13),
                      dataView.getUint8(profileStart + 14),
                      dataView.getUint8(profileStart + 15)
                    );
                    profileData['Device Class'] = deviceClass.trim();
                  }
                  
                  // Color space (offset 16 no perfil ICC)
                  if (profileStart + 19 < dataView.byteLength) {
                    const colorSpace = String.fromCharCode(
                      dataView.getUint8(profileStart + 16),
                      dataView.getUint8(profileStart + 17),
                      dataView.getUint8(profileStart + 18),
                      dataView.getUint8(profileStart + 19)
                    );
                    profileData['ColorSpace'] = colorSpace.trim();
                    
                    if (colorSpace.includes('RGB')) {
                      profileData['Color Model'] = 'RGB';
                    }
                  }
                }
              }
            }
          }
          
          const segmentLength = dataView.getUint16(offset + 2);
          if (segmentLength < 2) break;
          offset += 2 + segmentLength;
        }
      }
      
      // Procurar por assinatura 'acsp' (perfil ICC) em qualquer lugar do arquivo
      offset = 0;
      while (offset < dataView.byteLength - 4) {
        if (dataView.getUint32(offset) === 0x61637370) { // 'acsp'
          profileData['ICC Signature'] = 'Found';
          
          // Ler informações do perfil ICC
          if (offset >= 36) {
            const profileSize = dataView.getUint32(offset - 36);
            profileData['ICC Profile Size'] = `${profileSize} bytes`;
          }
          
          break;
        }
        offset++;
      }
      
      // Analisar componentes de cor JPEG
      if (dataView.getUint16(0) === 0xFFD8) {
        offset = 2;
        while (offset < dataView.byteLength - 10) {
          const marker = dataView.getUint16(offset);
          
          // Frame header markers
          if (marker === 0xFFC0 || marker === 0xFFC1 || marker === 0xFFC2) {
            const segmentLength = dataView.getUint16(offset + 2);
            const segmentStart = offset + 4;
            
            if (segmentStart + 6 < dataView.byteLength) {
              const precision = dataView.getUint8(segmentStart);
              const height = dataView.getUint16(segmentStart + 1);
              const width = dataView.getUint16(segmentStart + 3);
              const numComponents = dataView.getUint8(segmentStart + 5);
              
              profileData['Image Precision'] = `${precision} bits`;
              profileData['Color Components'] = numComponents;
              
              if (numComponents === 3) {
                profileData['Color Model Detection'] = 'YCbCr (3 components)';
              } else if (numComponents === 1) {
                profileData['Color Model Detection'] = 'Grayscale';
              }
            }
            break;
          }
          
          const segmentLength = dataView.getUint16(offset + 2);
          if (segmentLength < 2) break;
          offset += 2 + segmentLength;
        }
      }
      
      // Detectar padrões de cor no conteúdo
      const uint8Array = new Uint8Array(buffer);
      const sample = uint8Array.slice(0, Math.min(10000, uint8Array.length));
      
      // Heurística simples para detectar RGB vs YCbCr
      let rgbIndicators = 0;
      let ycbcrIndicators = 0;
      
      for (let i = 0; i < sample.length - 2; i++) {
        const r = sample[i];
        const g = sample[i + 1]; 
        const b = sample[i + 2];
        
        // Padrões típicos RGB (valores correlacionados)
        if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
          rgbIndicators++;
        }
        
        // Padrões típicos YCbCr (primeiro byte Y, outros Cb/Cr)
        if (r > 16 && r < 235 && (g < 16 || g > 240 || b < 16 || b > 240)) {
          ycbcrIndicators++;
        }
      }
      
      const totalSamples = sample.length / 3;
      if (rgbIndicators / totalSamples > 0.3) {
        profileData['Content Analysis'] = 'RGB-like patterns detected';
      } else if (ycbcrIndicators / totalSamples > 0.2) {
        profileData['Content Analysis'] = 'YCbCr-like patterns detected';
      }
      
    } catch (error) {
      console.warn('Erro ao analisar perfil de cor:', error);
    }
    
    return profileData;
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
      
      // Hashes criptográficos
      allMetadata['Hash SHA-256'] = await generateHash(buffer, 'SHA-256');
      allMetadata['Hash SHA-1'] = await generateHash(buffer, 'SHA-1');

      // Extrair dados EXIF para imagens
      if (file.type.startsWith('image/')) {
        const exifData = await extractExifData(buffer);
        Object.assign(allMetadata, exifData);
        
        // Analisar perfil de cor
        const colorProfile = analyzeColorProfile(buffer);
        Object.assign(allMetadata, colorProfile);
      }
      
      // Análise de entropy/randomness
      const entropy = calculateEntropy(uint8Array);
      allMetadata['Entropia (bits)'] = entropy.toFixed(4);
      allMetadata['Compressibilidade estimada'] = entropy > 7 ? 'Baixa' : entropy > 5 ? 'Média' : 'Alta';

      // Análise de bytes
      allMetadata['Primeiro byte (hex)'] = uint8Array[0]?.toString(16).padStart(2, '0').toUpperCase() || '00';
      allMetadata['Último byte (hex)'] = uint8Array[uint8Array.length - 1]?.toString(16).padStart(2, '0').toUpperCase() || '00';
      allMetadata['Bytes nulos'] = uint8Array.filter(b => b === 0).length;
      allMetadata['Bytes únicos'] = new Set(uint8Array).size;

      // Para imagens, extrair dimensões
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
      
      // Calcular pontuação de alteração
      const score = calculateAlterationScore(allMetadata);
      setScoreResult(score);
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

  const calculateAlterationScore = (metadata: FileMetadata): ScoreResult => {
    const rules: ScoreRule[] = [];
    let totalScore = 0;

    // Regra 1: Data de alteração diferente da data de criação (+4 Pontos)
    const modifyDate = metadata['Última modificação'] as Date;
    const createDate = metadata['Data de criação do objeto'] as Date;
    const exifModifyDate = metadata['ModifyDate'];
    const exifCreateDate = metadata['CreateDate'] || metadata['DateTimeOriginal'];
    
    let dateDifferenceFound = false;
    let dateReason = '';
    
    if (exifModifyDate && exifCreateDate) {
      // Comparar datas EXIF
      if (exifModifyDate !== exifCreateDate) {
        dateDifferenceFound = true;
        dateReason = `EXIF ModifyDate (${exifModifyDate}) ≠ CreateDate (${exifCreateDate})`;
      }
    } else if (modifyDate && createDate) {
      // Fallback para datas do sistema
      const diffMinutes = Math.abs(modifyDate.getTime() - createDate.getTime()) / (1000 * 60);
      if (diffMinutes > 1) { // Mais de 1 minuto de diferença
        dateDifferenceFound = true;
        dateReason = `Modificação do sistema (${modifyDate.toLocaleString()}) ≠ criação (${createDate.toLocaleString()})`;
      }
    }
    
    rules.push({
      name: 'Regra 1',
      description: 'Data de alteração diferente da data de criação',
      points: dateDifferenceFound ? 4 : 0,
      passed: dateDifferenceFound,
      reason: dateDifferenceFound ? dateReason : 'Datas de criação e modificação são iguais'
    });
    
    if (dateDifferenceFound) totalScore += 4;

    // Regra 2: tem o valor "YCbCr 4:4:4" em algum metadado (+2 Pontos)
    let ycbcrFound = false;
    let ycbcrReason = '';
    
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = String(value).toLowerCase();
      if (valueStr.includes('ycbcr') && (valueStr.includes('4:4:4') || valueStr.includes('444'))) {
        ycbcrFound = true;
        ycbcrReason = `Encontrado em ${key}: ${value}`;
        break;
      } else if (valueStr.includes('ycbcr4:2:0') || valueStr.includes('ycbcr 4:2:0')) {
        // Detectar YCbCr mesmo que não seja 4:4:4
        ycbcrReason = `YCbCr detectado mas não 4:4:4 em ${key}: ${value}`;
      }
    }
    
    rules.push({
      name: 'Regra 2',
      description: 'Tem o valor "YCbCr 4:4:4" em algum metadado',
      points: ycbcrFound ? 2 : 0,
      passed: ycbcrFound,
      reason: ycbcrFound ? ycbcrReason : (ycbcrReason || 'YCbCr 4:4:4 não encontrado')
    });
    
    if (ycbcrFound) totalScore += 2;

    // Regra 3: tem o valor "Photoshop" em algum metadado (+4 Pontos)
    let photoshopFound = false;
    let photoshopReason = '';
    
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = String(value).toLowerCase();
      if (valueStr.includes('photoshop') || valueStr.includes('adobe')) {
        photoshopFound = true;
        photoshopReason = `Encontrado em ${key}: ${value}`;
        break;
      }
    }
    
    rules.push({
      name: 'Regra 3',
      description: 'Tem o valor "Photoshop" em algum metadado',
      points: photoshopFound ? 4 : 0,
      passed: photoshopFound,
      reason: photoshopFound ? photoshopReason : 'Photoshop/Adobe não encontrado nos metadados'
    });
    
    if (photoshopFound) totalScore += 4;

    // Regra 4: tem o valor "RGB" em algum metadado (+10 Pontos)
    let rgbFound = false;
    let rgbReason = '';
    
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = String(value);
      if (valueStr.includes('RGB') || valueStr.includes('sRGB') || 
          (valueStr.toLowerCase().includes('colorspace') && valueStr.toLowerCase().includes('rgb'))) {
        rgbFound = true;
        rgbReason = `Encontrado em ${key}: ${value}`;
        break;
      }
    }
    
    rules.push({
      name: 'Regra 4',
      description: 'Tem o valor "RGB" em algum metadado',
      points: rgbFound ? 10 : 0,
      passed: rgbFound,
      reason: rgbFound ? rgbReason : 'RGB não encontrado nos metadados'
    });
    
    if (rgbFound) totalScore += 10;

    // Determinar nível de risco
    let riskLevel: 'Baixo' | 'Médio' | 'Alto' | 'Muito Alto';
    if (totalScore === 0) {
      riskLevel = 'Baixo';
    } else if (totalScore <= 4) {
      riskLevel = 'Médio';
    } else if (totalScore <= 10) {
      riskLevel = 'Alto';
    } else {
      riskLevel = 'Muito Alto';
    }

    return {
      totalScore,
      rules,
      riskLevel
    };
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
    if (key.toLowerCase().includes('pixel') || key.toLowerCase().includes('dimensão') || key.toLowerCase().includes('largura') || key.toLowerCase().includes('altura')) {
      return <Image className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('gps') || key.toLowerCase().includes('latitude') || key.toLowerCase().includes('longitude')) {
      return <MapPin className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('câmera') || key.toLowerCase().includes('iso') || key.toLowerCase().includes('abertura')) {
      return <Camera className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('cor') || key.toLowerCase().includes('espaço')) {
      return <Palette className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('entropia') || key.toLowerCase().includes('bytes')) {
      return <Zap className="h-4 w-4" />;
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

        {/* Seção de Pontuação de Alteração */}
        {scoreResult && (
          <div className="mt-6 p-6 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Análise de Alteração
              </h3>
              <div className="flex items-center gap-2">
                <Badge 
                  variant={
                    scoreResult.riskLevel === 'Muito Alto' ? 'destructive' : 
                    scoreResult.riskLevel === 'Alto' ? 'destructive' :
                    scoreResult.riskLevel === 'Médio' ? 'secondary' : 'outline'
                  }
                  className="text-sm font-semibold"
                >
                  {scoreResult.riskLevel}
                </Badge>
                <span className="text-2xl font-bold text-primary">
                  {scoreResult.totalScore} pts
                </span>
              </div>
            </div>
            
            <div className="grid gap-3">
              {scoreResult.rules.map((rule, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    rule.passed 
                      ? 'bg-destructive/10 border-destructive/20' 
                      : 'bg-muted/30 border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {rule.passed ? (
                      <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <div>
                      <span className="font-medium text-foreground">{rule.name}</span>
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                      {rule.reason && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          {rule.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={rule.passed ? 'destructive' : 'outline'}
                      className="text-xs"
                    >
                      {rule.passed ? `+${rule.points}` : '0'} pts
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-4 bg-muted/20 rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                <span className="font-semibold text-foreground">Pontuação total: {scoreResult.totalScore} pontos</span>
                <span className="block mt-1">
                  Quanto maior a pontuação, maior a probabilidade de alteração do arquivo
                </span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}