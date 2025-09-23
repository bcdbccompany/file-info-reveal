import { useCallback, useState } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSupabaseUpload, UploadProgress } from '@/hooks/useSupabaseUpload';

interface SupabaseUploadZoneProps {
  onMetadataExtracted: (data: { metadata: any; file?: File }) => void;
}

export function SupabaseUploadZone({ onMetadataExtracted }: SupabaseUploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const { uploading, progress, uploadFile, clearProgress } = useSupabaseUpload();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFile = async (file: File) => {
    try {
      console.log('Iniciando upload e processamento...');
      const uploadResult = await uploadFile(file);
      
      if (uploadResult.metadata) {
        onMetadataExtracted({
          metadata: uploadResult.metadata,
          file: file
        });
      }

    } catch (error) {
      console.error('Erro no processamento:', error);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFile(files[0]);
    }
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  }, []);

  const handleRemove = () => {
    clearProgress();
    onMetadataExtracted({ metadata: {} });
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'Análise de metadados concluída';
      case 'failed':
        return 'Falha na análise de metadados';
      default:
        return 'Processando...';
    }
  };

  if (progress) {
    return (
      <div className="border-2 border-dashed border-border rounded-lg p-6 bg-muted/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <File className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium">{progress?.fileName}</p>
              {progress && (
                <div className="flex items-center space-x-2 mt-1">
                  {getStatusIcon(progress.status)}
                  <span className="text-sm text-muted-foreground">
                    {getStatusText(progress.status)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {progress?.status === 'completed' && (
          <Alert className="mb-4">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Análise de metadados concluída com sucesso!
            </AlertDescription>
          </Alert>
        )}

        {uploading && (
          <div className="mb-4">
            <Progress value={50} className="h-2" />
            <p className="text-sm text-muted-foreground mt-1">Fazendo upload...</p>
          </div>
        )}

        {progress?.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{progress.error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragActive
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
      />
      
      <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">Upload de Imagem</h3>
      <p className="text-muted-foreground mb-4">
        Arraste e solte uma imagem aqui ou clique para selecionar
      </p>
      <p className="text-sm text-muted-foreground">
        Suporta: JPEG, PNG, WebP, TIFF, BMP, GIF (máx. 20MB)
      </p>
    </div>
  );
}