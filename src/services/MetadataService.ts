import { supabase } from "@/integrations/supabase/client";

interface ExifToolResponse {
  success: boolean;
  metadata?: { [key: string]: any };
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}

export class MetadataService {
  static async extractMetadataWithExifTool(file: File): Promise<ExifToolResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use direct fetch to the Edge Function URL instead of supabase.functions.invoke
      const response = await fetch('https://ivjkadbbzjarmoroodxc.supabase.co/functions/v1/extract-metadata', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2amthZGJiemphcm1vcm9vZHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MjgyNTksImV4cCI6MjA3NDIwNDI1OX0.FG8T6wntWfXiEaXjDICtrazTriXwqjOKe7J7iCBXHU8`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('Error calling ExifTool API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract metadata'
      };
    }
  }

  // Fallback para parser JavaScript quando ExifTool não estiver disponível
  static async extractMetadataFallback(file: File): Promise<{ [key: string]: any }> {
    const metadata: { [key: string]: any } = {};

    // Metadados básicos do arquivo
    metadata['SourceFile'] = file.name;
    metadata['File:FileSize'] = file.size;
    metadata['File:FileType'] = file.type || 'Unknown';
    metadata['File:FileModifyDate'] = new Date(file.lastModified).toISOString();
    metadata['File:FileName'] = file.name;
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    metadata['File:FileTypeExtension'] = extension || '';

    // Para imagens, tentar extrair dimensões
    if (file.type.startsWith('image/')) {
      try {
        const dimensions = await this.getImageDimensions(file);
        metadata['EXIF:ImageWidth'] = dimensions.width;
        metadata['EXIF:ImageHeight'] = dimensions.height;
        metadata['EXIF:Megapixels'] = ((dimensions.width * dimensions.height) / 1000000).toFixed(2);
      } catch (error) {
        console.warn('Could not extract image dimensions:', error);
      }

      // Tentar extrair EXIF básico
      try {
        const buffer = await file.arrayBuffer();
        const basicExif = await this.extractBasicExif(buffer);
        Object.assign(metadata, basicExif);
      } catch (error) {
        console.warn('Could not extract EXIF data:', error);
      }
    }

    return metadata;
  }

  private static getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject('Not an image file');
        return;
      }
      
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject('Failed to load image');
      };
      
      img.src = url;
    });
  }

  private static async extractBasicExif(buffer: ArrayBuffer): Promise<{ [key: string]: any }> {
    const exifData: { [key: string]: any } = {};
    const dataView = new DataView(buffer);
    
    try {
      // Verificar se é JPEG
      if (dataView.getUint16(0) !== 0xFFD8) {
        return exifData;
      }

      // Buscar segmento APP1 (EXIF)
      let offset = 2;
      while (offset < dataView.byteLength - 10) {
        const marker = dataView.getUint16(offset);
        
        if (marker === 0xFFE1) { // APP1 segment
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
              
              exifData['EXIF:ByteOrder'] = littleEndian ? 'Little-endian (Intel)' : 'Big-endian (Motorola)';
              
              // Adicionar alguns campos básicos detectados
              exifData['EXIF:ExifVersion'] = 'Detected via JavaScript';
            }
          }
          break;
        }
        
        const segmentLength = dataView.getUint16(offset + 2);
        if (segmentLength < 2) break;
        offset += 2 + segmentLength;
      }
      
    } catch (error) {
      console.warn('Error in basic EXIF extraction:', error);
    }
    
    return exifData;
  }
}