import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { corsHeaders } from '../_shared/cors.ts'

interface UploadRequest {
  file: {
    name: string
    data: string // base64 encoded
    type: string
    size: number
  }
  webhookUrl?: string
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

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const requestData: UploadRequest = await req.json()
    const { file, webhookUrl } = requestData

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

    // Generate unique file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const extension = file.name.split('.').pop()
    const fileName = `${timestamp}_${crypto.randomUUID()}.${extension}`
    const filePath = `${user.id}/${fileName}`

    // Convert base64 to Uint8Array
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

    // Create metadata processing job
    const { data: jobData, error: jobError } = await supabase
      .from('metadata_jobs')
      .insert({
        user_id: user.id,
        file_path: uploadData.path,
        file_name: file.name,
        file_size: file.size,
        webhook_url: webhookUrl,
        status: 'pending'
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

    console.log('Processing job created:', jobData.id)

    // Get signed URL for file access
    const { data: signedUrlData } = await supabase.storage
      .from('image-uploads')
      .createSignedUrl(uploadData.path, 3600) // 1 hour expiry

    // If webhook URL is provided, trigger external processing
    if (webhookUrl) {
      console.log('Triggering external processing webhook:', webhookUrl)
      
      try {
        // Get public URL for the external service to access
        const { data: publicUrlData } = supabase.storage
          .from('image-uploads')
          .getPublicUrl(uploadData.path)

        await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jobId: jobData.id,
            userId: user.id,
            fileName: file.name,
            fileUrl: publicUrlData.publicUrl,
            filePath: uploadData.path,
            callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/metadata-callback`
          })
        })

        // Update job status to processing
        await supabase
          .from('metadata_jobs')
          .update({ status: 'processing' })
          .eq('id', jobData.id)

        console.log('External processing webhook sent successfully')
      } catch (webhookError) {
        console.error('Webhook error:', webhookError)
        // Don't fail the request if webhook fails - job can be processed later
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId: jobData.id,
        filePath: uploadData.path,
        fileName: file.name,
        fileUrl: signedUrlData?.signedUrl,
        status: webhookUrl ? 'processing' : 'pending'
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