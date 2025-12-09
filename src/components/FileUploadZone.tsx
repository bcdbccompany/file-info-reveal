import { useState, useCallback } from 'react';
import { Upload, File, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

interface FileUploadResult {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  data?: any;
  error?: string;
}

interface FileUploadZoneProps {
  onFilesUpload: (results: FileUploadResult[]) => void;
  uploadedFiles?: FileUploadResult[];
  onRemoveFiles?: () => void;
}

const MAX_FILES = 10;

export default function FileUploadZone({ onFilesUpload, uploadedFiles, onRemoveFiles }: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadResult[]>([]);
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

  const processFile = async (file: File): Promise<FileUploadResult> => {
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

      return { file, status: 'success', data };
    } catch (error) {
      console.error('Upload/processing error:', error);
      return { 
        file, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Falha ao processar o arquivo' 
      };
    }
  };

  const processFiles = useCallback(async (files: File[]) => {
    if (isUploading) return;
    
    const filesToProcess = Array.from(files).slice(0, MAX_FILES);
    
    if (files.length > MAX_FILES) {
      toast({
        title: "Limite de arquivos",
        description: `Máximo de ${MAX_FILES} arquivos permitidos. Processando os primeiros ${MAX_FILES}.`,
        variant: "destructive"
      });
    }

    setIsUploading(true);
    
    // Initialize progress tracking
    const initialProgress: FileUploadResult[] = filesToProcess.map(file => ({
      file,
      status: 'pending'
    }));
    setUploadProgress(initialProgress);

    // Process files sequentially to avoid overwhelming the edge function
    const results: FileUploadResult[] = [];
    
    for (let index = 0; index < filesToProcess.length; index++) {
      const file = filesToProcess[index];
      
      // Update status to uploading
      setUploadProgress(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'uploading' };
        return updated;
      });

      const result = await processFile(file);

      // Update status with result
      setUploadProgress(prev => {
        const updated = [...prev];
        updated[index] = result;
        return updated;
      });

      results.push(result);
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    if (successCount > 0) {
      toast({
        title: "Processamento concluído!",
        description: `${successCount} arquivo(s) processado(s) com sucesso${errorCount > 0 ? `, ${errorCount} com erro` : ''}.`,
      });
    } else {
      toast({
        title: "Erro no processamento",
        description: "Nenhum arquivo foi processado com sucesso.",
        variant: "destructive"
      });
    }

    onFilesUpload(results);
    setIsUploading(false);
    setUploadProgress([]);
  }, [onFilesUpload, isUploading, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }, [processFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  }, [processFiles]);

  const formatBytes = (b?: number): string => {
    if (!Number.isFinite(b)) return '—';
    if (b === 0) return '0 B';
    if (b! < 1024) return `${b} B`;
    if (b! < 1048576) return `${(b! / 1024).toFixed(1)} KB`;
    if (b! < 1073741824) return `${(b! / 1048576).toFixed(1)} MB`;
    return `${(b! / 1073741824).toFixed(2)} GB`;
  };

  const guessFromExt = (name?: string): string | undefined => {
    const ext = name?.split('.').pop()?.toLowerCase();
    if (!ext) return undefined;
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'heic': 'image/heic',
      'pdf': 'application/pdf',
      'mp4': 'video/mp4',
    };
    return mimeMap[ext];
  };

  // Show upload progress
  if (isUploading && uploadProgress.length > 0) {
    const completedCount = uploadProgress.filter(p => p.status === 'success' || p.status === 'error').length;
    const progressPercent = (completedCount / uploadProgress.length) * 100;

    return (
      <div className="w-full max-w-2xl bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <div>
              <p className="font-semibold text-foreground">Processando arquivos...</p>
              <p className="text-sm text-muted-foreground">
                {completedCount} de {uploadProgress.length} arquivos
              </p>
            </div>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {uploadProgress.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                {item.status === 'pending' && (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                )}
                {item.status === 'uploading' && (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                )}
                {item.status === 'success' && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {item.status === 'error' && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm truncate flex-1">{item.file.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show uploaded files list
  if (uploadedFiles && uploadedFiles.length > 0) {
    const successFiles = uploadedFiles.filter(f => f.status === 'success');
    const errorFiles = uploadedFiles.filter(f => f.status === 'error');

    return (
      <div className="w-full max-w-2xl bg-gradient-card border border-border rounded-lg p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <File className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {successFiles.length} arquivo(s) processado(s)
              </p>
              {errorFiles.length > 0 && (
                <p className="text-sm text-destructive">
                  {errorFiles.length} arquivo(s) com erro
                </p>
              )}
            </div>
          </div>
          {onRemoveFiles && (
            <button
              onClick={onRemoveFiles}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Remover arquivos"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {uploadedFiles.map((item, index) => (
            <div key={index} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
              {item.status === 'success' ? (
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
              )}
              <span className="text-sm truncate flex-1">{item.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</span>
            </div>
          ))}
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
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleChange}
          disabled={isUploading}
          aria-label="Upload de arquivos"
        />
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Upload className="h-8 w-8 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Arraste arquivos aqui
            </h3>
            <p className="text-muted-foreground mb-4">
              ou clique para selecionar arquivos do seu dispositivo
            </p>
            <p className="text-sm text-muted-foreground">
              Máximo de {MAX_FILES} arquivos por vez
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
