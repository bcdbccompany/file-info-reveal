import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

console.log('Extract Metadata Edge Function inicializada')

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Convert file to bytes for processing
    const bytes = new Uint8Array(await file.arrayBuffer())
    
    // Create temporary file in /tmp directory (Deno.makeTempFile is blocklisted)
    const extension = file.name.split('.').pop() || 'tmp'
    const tempFile = `/tmp/metadata_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`
    await Deno.writeFile(tempFile, bytes)

    try {
      // Execute exiftool with the specified flags
      const command = new Deno.Command("exiftool", {
        args: ["-a", "-G1", "-s", "-json", tempFile],
        stdout: "piped",
        stderr: "piped",
      })

      const { code, stdout, stderr } = await command.output()

      if (code !== 0) {
        const errorText = new TextDecoder().decode(stderr)
        throw new Error(`ExifTool error: ${errorText}`)
      }

      const output = new TextDecoder().decode(stdout)
      const metadata = JSON.parse(output)[0] // ExifTool returns array with one object
      
      // Clean up temp file
      await Deno.remove(tempFile)

      return new Response(
        JSON.stringify({ 
          success: true, 
          metadata,
          originalFilename: file.name,
          fileSize: file.size,
          mimeType: file.type
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (error) {
      // Clean up temp file on error
      try {
        await Deno.remove(tempFile)
      } catch {}
      
      throw error
    }

  } catch (error) {
    console.error('Error extracting metadata:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to extract metadata' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})