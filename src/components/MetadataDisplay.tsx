import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, HardDrive, Hash } from 'lucide-react';

interface FileMetadata {
  [key: string]: string | number | boolean | Date;
}

interface MetadataDisplayProps {
  file: File;
}

export default function MetadataDisplay({ file }: MetadataDisplayProps) {
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
      if (value > 1024) {
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

  const getMetadata = (): FileMetadata => {
    const metadata: FileMetadata = {
      'Nome do arquivo': file.name,
      'Tamanho': file.size,
      'Tipo MIME': file.type || 'Não especificado',
      'Última modificação': new Date(file.lastModified),
      'Extensão': file.name.split('.').pop()?.toLowerCase() || 'Sem extensão',
    };

    // Adicionar metadados derivados
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension) {
      metadata['Categoria'] = getCategoryFromExtension(extension);
    }

    // Calcular hash simples do nome
    metadata['Hash do nome'] = generateSimpleHash(file.name);

    // WebkitRelativePath se disponível
    if ('webkitRelativePath' in file && (file as any).webkitRelativePath) {
      metadata['Caminho relativo'] = (file as any).webkitRelativePath;
    }

    return metadata;
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

  const metadata = getMetadata();
  const metadataEntries = Object.entries(metadata);

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