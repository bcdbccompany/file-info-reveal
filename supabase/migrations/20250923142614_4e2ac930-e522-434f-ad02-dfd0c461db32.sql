-- Enable public access to metadata_jobs table
DROP POLICY IF EXISTS "Users can create their own metadata jobs" ON public.metadata_jobs;
DROP POLICY IF EXISTS "Users can view their own metadata jobs" ON public.metadata_jobs;
DROP POLICY IF EXISTS "Users can update their own metadata jobs" ON public.metadata_jobs;

-- Create public policies for metadata_jobs
CREATE POLICY "Anyone can create metadata jobs" 
ON public.metadata_jobs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view metadata jobs" 
ON public.metadata_jobs 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can update metadata jobs" 
ON public.metadata_jobs 
FOR UPDATE 
USING (true);

-- Enable public access to file_metadata table
DROP POLICY IF EXISTS "Users can create their own file metadata" ON public.file_metadata;
DROP POLICY IF EXISTS "Users can view their own file metadata" ON public.file_metadata;
DROP POLICY IF EXISTS "Users can update their own file metadata" ON public.file_metadata;

-- Create public policies for file_metadata
CREATE POLICY "Anyone can create file metadata" 
ON public.file_metadata 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view file metadata" 
ON public.file_metadata 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can update file metadata" 
ON public.file_metadata 
FOR UPDATE 
USING (true);

-- Update storage policies for public access
DROP POLICY IF EXISTS "Users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view files" ON storage.objects;

-- Create public storage policies
CREATE POLICY "Anyone can upload to image-uploads bucket" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'image-uploads');

CREATE POLICY "Anyone can view image-uploads files" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'image-uploads');