-- Add new columns to file_metadata table for ExifTool API integration
ALTER TABLE public.file_metadata 
ADD COLUMN IF NOT EXISTS bucket text,
ADD COLUMN IF NOT EXISTS mime_type text,
ADD COLUMN IF NOT EXISTS size_bytes bigint,
ADD COLUMN IF NOT EXISTS exif_raw jsonb;