import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "../_shared/cors.ts"

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const analyzerApiUrl = Deno.env.get('ANALYZER_API_URL')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const { filePath, fileName, mimeType, sizeBytes } = await req.json()
    
    // Generate signed URL for the uploaded file (60 seconds validity)
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('image-uploads')
      .createSignedUrl(filePath, 60)

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError)
      return new Response(JSON.stringify({ error: 'Failed to create signed URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Call the ExifTool API
    const apiResponse = await fetch(`${analyzerApiUrl}/api/Analyze/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        signeUrl: signedUrlData.signedUrl
      })
    })

    if (!apiResponse.ok) {
      console.error('ExifTool API error:', apiResponse.status, await apiResponse.text())
      return new Response(JSON.stringify({ error: 'Failed to analyze file metadata' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const exifToolResponse = await apiResponse.json()

    if (!exifToolResponse.ok || !exifToolResponse.exif) {
      console.error('Invalid ExifTool response:', exifToolResponse)
      return new Response(JSON.stringify({ error: 'Invalid response from metadata analyzer' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Extract the first exif object (should be the main file data)
    const exifData = exifToolResponse.exif[0]

    // Save to database
    const { data: metadata, error: insertError } = await supabase
      .from('file_metadata')
      .insert({
        file_name: fileName,
        file_path: filePath,
        bucket: 'image-uploads',
        mime_type: mimeType,
        size_bytes: sizeBytes,
        exif_raw: exifData,
        exif_data: exifData, // Keep backward compatibility
        file_info: {
          name: fileName,
          size: sizeBytes,
          type: mimeType,
          lastModified: Date.now()
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error('Database insert error:', insertError)
      return new Response(JSON.stringify({ error: 'Failed to save metadata' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      metadata,
      rawExifData: exifData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})