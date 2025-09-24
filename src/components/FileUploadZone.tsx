import { useState, useCallback } from 'react';
import { Upload, File, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FileUploadZoneProps {
  onFileUpload: (metadata: any) => void;
  uploadedFile?: File | null;
  onRemoveFile?: () => void;
}

export default function FileUploadZone({ onFileUpload, uploadedFile, onRemoveFile }: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (isUploading) return;
    
    setIsUploading(true);
    
    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('image-uploads')
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Process metadata with ExifTool API
      const { data, error } = await supabase.functions.invoke('process-file-metadata', {
        body: {
          filePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size
        }
      });

      if (error) {
        throw new Error(`Processing failed: ${error.message}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Unknown processing error');
      }

      onFileUpload(data);
      
      toast({
        title: "Arquivo processado com sucesso!",
        description: "Metadados extraídos usando ExifTool API.",
      });

    } catch (error) {
      console.error('Upload/processing error:', error);
      toast({
        title: "Erro no processamento",
        description: error instanceof Error ? error.message : "Falha ao processar o arquivo",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  }, [onFileUpload, isUploading, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  }, [processFile]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (uploadedFile) {
    return (
      <div className="w-full max-w-2xl bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <File className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{uploadedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(uploadedFile.size)} • {uploadedFile.type || 'Tipo desconhecido'}
              </p>
            </div>
          </div>
          {onRemoveFile && (
            <button
              onClick={onRemoveFile}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Remover arquivo"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300",
          "hover:shadow-upload hover:border-upload-border hover:bg-upload-hover",
          dragActive ? "border-upload-border bg-upload-hover shadow-upload" : "border-upload-border bg-upload-bg",
          isUploading ? "cursor-wait" : "cursor-pointer group"
        )}
        onDragEnter={!isUploading ? handleDrag : undefined}
        onDragLeave={!isUploading ? handleDrag : undefined}
        onDragOver={!isUploading ? handleDrag : undefined}
        onDrop={!isUploading ? handleDrop : undefined}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleChange}
          disabled={isUploading}
          aria-label="Upload de arquivo"
        />
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            {isUploading ? (
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            ) : (
              <Upload className="h-8 w-8 text-white" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {isUploading ? "Processando arquivo..." : "Arraste um arquivo aqui"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {isUploading 
                ? "Extraindo metadados com ExifTool API..." 
                : "ou clique para selecionar um arquivo do seu dispositivo"
              }
            </p>
            <p className="text-sm text-muted-foreground">
              Suporte para qualquer tipo de arquivo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}