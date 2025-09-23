import ExifReader from 'exifreader';

export class MetadataService {
  static async extractMetadata(file: File): Promise<{ [key: string]: any }> {
    console.log('Extraindo metadados com ExifReader...');
    
    try {
      const buffer = await file.arrayBuffer();
      
      // Usar ExifReader para extrair todos os metadados possíveis
      const tags = ExifReader.load(buffer, { 
        expanded: true,
        includeUnknown: true
      });
      
      const metadata: { [key: string]: any } = {};
      
      // Processar todos os tags encontrados
      if (tags) {
        // Processar EXIF
        if (tags.exif) {
          Object.entries(tags.exif).forEach(([key, value]) => {
            if (value && typeof value === 'object' && 'description' in value) {
              metadata[`EXIF:${key}`] = value.description || value.value;
            }
          });
        }
        
        // Processar IPTC
        if (tags.iptc) {
          Object.entries(tags.iptc).forEach(([key, value]) => {
            if (value && typeof value === 'object' && 'description' in value) {
              metadata[`IPTC:${key}`] = value.description || value.value;
            }
          });
        }
        
        // Processar XMP
        if (tags.xmp) {
          Object.entries(tags.xmp).forEach(([key, value]) => {
            if (value && typeof value === 'object' && 'description' in value) {
              metadata[`XMP:${key}`] = value.description || value.value;
            }
          });
        }
        
        // Processar File info
        if (tags.file) {
          Object.entries(tags.file).forEach(([key, value]) => {
            if (value && typeof value === 'object' && 'description' in value) {
              metadata[`File:${key}`] = value.description || value.value;
            }
          });
        }
        
        // Processar ICC Profile
        if (tags.icc) {
          Object.entries(tags.icc).forEach(([key, value]) => {
            if (value && typeof value === 'object' && 'description' in value) {
              metadata[`ICC:${key}`] = value.description || value.value;
            }
          });
        }
      }
      
      // Adicionar metadados básicos do arquivo sempre
      metadata['SourceFile'] = file.name;
      metadata['File:FileSize'] = file.size;
      metadata['File:FileType'] = file.type || 'Unknown';
      metadata['File:FileModifyDate'] = new Date(file.lastModified).toISOString();
      metadata['File:FileName'] = file.name;
      
      const extension = file.name.split('.').pop()?.toLowerCase();
      metadata['File:FileTypeExtension'] = extension || '';
      
      // Para imagens, adicionar dimensões se não foram extraídas pelo ExifReader
      if (file.type.startsWith('image/') && !metadata['EXIF:ImageWidth']) {
        try {
          const dimensions = await this.getImageDimensions(file);
          metadata['EXIF:ImageWidth'] = dimensions.width;
          metadata['EXIF:ImageHeight'] = dimensions.height;
          metadata['EXIF:Megapixels'] = ((dimensions.width * dimensions.height) / 1000000).toFixed(2);
        } catch (error) {
          console.warn('Could not extract image dimensions:', error);
        }
      }
      
      console.log('ExifReader extraiu metadados com sucesso!', Object.keys(metadata).length, 'campos encontrados');
      return metadata;
      
    } catch (error) {
      console.warn('ExifReader falhou, usando fallback básico:', error);
      return this.extractBasicMetadata(file);
    }
  }

  // Fallback básico se ExifReader falhar
  private static async extractBasicMetadata(file: File): Promise<{ [key: string]: any }> {
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

}