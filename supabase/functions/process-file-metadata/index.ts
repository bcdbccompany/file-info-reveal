import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "../_shared/cors.ts"

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const analyzerApiUrl = Deno.env.get('ANALYZER_API_URL')!

// Retry configuration
const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 1000

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      // If successful or client error (4xx), return immediately
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response
      }
      
      // Server error (5xx) - retry with backoff
      console.log(`Attempt ${attempt + 1}/${retries} failed with status ${response.status}, retrying...`)
      lastError = new Error(`HTTP ${response.status}`)
      
    } catch (error) {
      console.log(`Attempt ${attempt + 1}/${retries} failed with error: ${error.message}, retrying...`)
      lastError = error
    }
    
    // Exponential backoff
    if (attempt < retries - 1) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError || new Error('Max retries exceeded')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const { filePath, fileName, mimeType, sizeBytes } = await req.json()
    
    // Generate signed URL for the uploaded file (120 seconds validity for retries)
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('image-uploads')
      .createSignedUrl(filePath, 120)

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError)
      return new Response(JSON.stringify({ error: 'Failed to create signed URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Call the ExifTool API with retry logic
    let apiResponse: Response
    try {
      apiResponse = await fetchWithRetry(`${analyzerApiUrl}/api/Analyze/url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          signeUrl: signedUrlData.signedUrl
        })
      })
    } catch (retryError) {
      console.error('ExifTool API failed after retries:', retryError.message)
      return new Response(JSON.stringify({ error: 'Analyzer API temporarily unavailable, please try again' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

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