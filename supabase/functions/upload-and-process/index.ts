import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { corsHeaders } from '../_shared/cors.ts'
import { ExifTool } from 'https://esm.sh/exiftool-vendored@28.7.1'
import ExifReader from 'https://esm.sh/exifreader@4.32.0'

interface UploadRequest {
  file: {
    name: string
    data: string // base64 encoded
    type: string
    size: number
  }
}

interface MetadataResult {
  exif?: any
  iptc?: any
  xmp?: any
  fileInfo?: any
}

Deno.serve(async (req) => {
  console.log('Upload and process function called')

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // No authentication required for public access
    console.log('Processing public upload request')

    const requestData: UploadRequest = await req.json()
    const { file } = requestData

    // Validate file data
    if (!file || !file.name || !file.data || !file.type) {
      return new Response(
        JSON.stringify({ error: 'Invalid file data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check file size (20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'File size exceeds 20MB limit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check mime type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: 'File type not allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate unique file path for public uploads
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const extension = file.name.split('.').pop()
    const fileName = `${timestamp}_${crypto.randomUUID()}.${extension}`
    const filePath = `public/${fileName}`

    // Convert base64 to Uint8Array for storage
    const base64Data = file.data.split(',')[1] || file.data
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('image-uploads')
      .upload(filePath, binaryData, {
        contentType: file.type,
        duplex: 'half'
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to upload file', details: uploadError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('File uploaded successfully:', uploadData.path)

    // Extract metadata from the binary data
    let metadata: MetadataResult = {}
    
    try {
      console.log('Extracting metadata from file using ExifTool...')
      
      // Create temporary file for ExifTool processing
      const tempFilePath = `/tmp/${crypto.randomUUID()}.${extension}`
      await Deno.writeFile(tempFilePath, binaryData)
      
      console.log('Created temporary file:', tempFilePath)
      
      // Initialize ExifTool with CLI arguments: -a -G1 -s -j
      const exifTool = new ExifTool()
      
      try {
        // Extract metadata using ExifTool with specified parameters
        const exifToolOutput = await exifTool.read(tempFilePath, ['-a', '-G1', '-s', '-j'])
        
        console.log('ExifTool extraction completed successfully')
        
        // Process ExifTool JSON output
        const organizedMetadata = {
          exif: {},
          iptc: {},
          xmp: {},
          fileInfo: {
            size: file.size,
            type: file.type,
            name: file.name,
            lastModified: new Date().toISOString()
          }
        }

        // Process ExifTool structured output by groups
        for (const [key, value] of Object.entries(exifToolOutput)) {
          if (key.startsWith('EXIF:') || key.startsWith('IFD0:') || key.startsWith('IFD1:') || key.startsWith('ExifIFD:')) {
            organizedMetadata.exif[key] = value
          } else if (key.startsWith('IPTC:')) {
            organizedMetadata.iptc[key] = value
          } else if (key.startsWith('XMP:') || key.startsWith('XMP-')) {
            organizedMetadata.xmp[key] = value
          } else if (key.startsWith('System:') || key.startsWith('File:')) {
            organizedMetadata.fileInfo[key] = value
          } else {
            // Default to EXIF for ungrouped tags
            organizedMetadata.exif[key] = value
          }
        }
        
        metadata = organizedMetadata
        console.log('ExifTool metadata processed successfully, found', Object.keys(exifToolOutput).length, 'tags')
        
      } catch (exifToolError) {
        console.error('ExifTool extraction failed, falling back to ExifReader:', exifToolError)
        
        // Fallback to ExifReader
        const arrayBuffer = binaryData.buffer.slice(
          binaryData.byteOffset, 
          binaryData.byteOffset + binaryData.byteLength
        )
        
        const tags = ExifReader.load(arrayBuffer, {
          expanded: true,
          includeUnknown: true
        })
        
        const organizedMetadata = {
          exif: {},
          iptc: {},
          xmp: {},
          fileInfo: {
            size: file.size,
            type: file.type,
            name: file.name,
            lastModified: new Date().toISOString()
          }
        }

        for (const [name, tag] of Object.entries(tags)) {
          const tagValue = tag?.description || tag?.value || tag
          
          if (name.toLowerCase().includes('exif') || name.startsWith('0x')) {
            organizedMetadata.exif[name] = tagValue
          } else if (name.toLowerCase().includes('iptc') || name.startsWith('iptc:')) {
            organizedMetadata.iptc[name] = tagValue
          } else if (name.toLowerCase().includes('xmp') || name.startsWith('xmp:')) {
            organizedMetadata.xmp[name] = tagValue
          } else {
            organizedMetadata.exif[name] = tagValue
          }
        }
        
        metadata = organizedMetadata
        console.log('ExifReader fallback completed, found', Object.keys(tags).length, 'tags')
      } finally {
        // Cleanup temporary file and ExifTool instance
        try {
          await Deno.remove(tempFilePath)
          await exifTool.end()
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError)
        }
      }
      
    } catch (metadataError) {
      console.error('Metadata extraction error:', metadataError)
      // Continue with empty metadata if extraction fails
    }

    // Create metadata processing job
    const { data: jobData, error: jobError } = await supabase
      .from('metadata_jobs')
      .insert({
        user_id: null, // Public access - no user required
        file_path: uploadData.path,
        file_name: file.name,
        file_size: file.size,
        status: 'completed'
      })
      .select()
      .single()

    if (jobError) {
      console.error('Job creation error:', jobError)
      return new Response(
        JSON.stringify({ error: 'Failed to create processing job', details: jobError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Save metadata to database
    const { error: metadataError } = await supabase
      .from('file_metadata')
      .insert({
        job_id: jobData.id,
        user_id: null, // Public access - no user required
        file_path: uploadData.path,
        file_name: file.name,
        exif_data: metadata.exif,
        iptc_data: metadata.iptc,
        xmp_data: metadata.xmp,
        file_info: metadata.fileInfo
      })

    if (metadataError) {
      console.error('Metadata save error:', metadataError)
      // Don't fail the request if metadata save fails
    }

    // Get signed URL for file access
    const { data: signedUrlData } = await supabase.storage
      .from('image-uploads')
      .createSignedUrl(uploadData.path, 3600) // 1 hour expiry

    console.log('Processing completed successfully')

    return new Response(
      JSON.stringify({
        success: true,
        jobId: jobData.id,
        filePath: uploadData.path,
        fileName: file.name,
        fileUrl: signedUrlData?.signedUrl,
        status: 'completed',
        metadata: metadata
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})