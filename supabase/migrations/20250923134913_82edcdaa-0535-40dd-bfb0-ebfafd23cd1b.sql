-- Create storage bucket for image uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'image-uploads', 
  'image-uploads', 
  false, 
  20971520, -- 20MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'image/gif']
);

-- Create storage policies for authenticated users
CREATE POLICY "Users can upload their own images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'image-uploads' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own images" ON storage.objects
FOR SELECT USING (
  bucket_id = 'image-uploads' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'image-uploads' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Create table for metadata processing jobs
CREATE TABLE public.metadata_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Create table for storing extracted metadata
CREATE TABLE public.file_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.metadata_jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  exif_data JSONB,
  iptc_data JSONB,
  xmp_data JSONB,
  file_info JSONB,
  analysis_results JSONB, -- Resultados da análise forense
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on metadata tables
ALTER TABLE public.metadata_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for metadata_jobs
CREATE POLICY "Users can view their own metadata jobs" ON public.metadata_jobs
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own metadata jobs" ON public.metadata_jobs
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own metadata jobs" ON public.metadata_jobs
FOR UPDATE USING (auth.uid() = user_id);

-- Create RLS policies for file_metadata
CREATE POLICY "Users can view their own file metadata" ON public.file_metadata
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own file metadata" ON public.file_metadata
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own file metadata" ON public.file_metadata
FOR UPDATE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_metadata_jobs_user_id ON public.metadata_jobs(user_id);
CREATE INDEX idx_metadata_jobs_status ON public.metadata_jobs(status);
CREATE INDEX idx_file_metadata_job_id ON public.file_metadata(job_id);
CREATE INDEX idx_file_metadata_user_id ON public.file_metadata(user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_file_metadata_updated_at
BEFORE UPDATE ON public.file_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();