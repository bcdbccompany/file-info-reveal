import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UploadProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileName: string;
  fileUrl?: string;
  error?: string;
}

export function useSupabaseUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setProgress(null);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // No authentication required for public uploads
      console.log('Starting public file upload')

      // Call upload edge function
      const { data, error } = await supabase.functions.invoke('upload-and-process', {
        body: {
          file: {
            name: file.name,
            data: base64,
            type: file.type,
            size: file.size
          }
        }
      });

      if (error) {
        throw error;
      }

      const uploadResult = data as {
        success: boolean;
        jobId: string;
        filePath: string;
        fileName: string;
        fileUrl?: string;
        status: string;
        metadata?: any;
      };

      if (!uploadResult.success) {
        throw new Error('Upload failed');
      }

      setProgress({
        jobId: uploadResult.jobId,
        status: uploadResult.status as any,
        fileName: uploadResult.fileName,
        fileUrl: uploadResult.fileUrl
      });

      return uploadResult;

    } catch (error) {
      console.error('Upload error:', error);
      setProgress({
        jobId: '',
        status: 'failed',
        fileName: file.name,
        error: error.message
      });
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const checkJobStatus = async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .from('metadata_jobs')
        .select('*, file_metadata(*)')
        .eq('id', jobId)
        .single();

      if (error) {
        throw error;
      }

      setProgress(prev => prev ? {
        ...prev,
        status: data.status as 'pending' | 'processing' | 'completed' | 'failed',
        error: data.error_message
      } : null);

      return data;
    } catch (error) {
      console.error('Status check error:', error);
      throw error;
    }
  };

  return {
    uploading,
    progress,
    uploadFile,
    checkJobStatus,
    clearProgress: () => setProgress(null)
  };
}