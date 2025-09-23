import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { corsHeaders } from '../_shared/cors.ts'

interface MetadataCallbackRequest {
  jobId: string
  userId: string
  status: 'completed' | 'failed'
  metadata?: {
    exif?: any
    iptc?: any
    xmp?: any
    fileInfo?: any
    analysisResults?: any
  }
  error?: string
}

Deno.serve(async (req) => {
  console.log('Metadata callback function called')

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const requestData: MetadataCallbackRequest = await req.json()
    const { jobId, userId, status, metadata, error: errorMessage } = requestData

    console.log('Processing callback for job:', jobId, 'Status:', status)

    // Validate required fields
    if (!jobId || !userId || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: jobId, userId, status' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the job to verify it exists and get file info
    const { data: job, error: jobError } = await supabase
      .from('metadata_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single()

    if (jobError || !job) {
      console.error('Job not found:', jobError)
      return new Response(
        JSON.stringify({ error: 'Job not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update job status
    const updateData: any = {
      status,
      processed_at: new Date().toISOString()
    }

    if (errorMessage) {
      updateData.error_message = errorMessage
    }

    const { error: updateError } = await supabase
      .from('metadata_jobs')
      .update(updateData)
      .eq('id', jobId)

    if (updateError) {
      console.error('Failed to update job:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update job status', details: updateError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If completed and metadata provided, save the metadata
    if (status === 'completed' && metadata) {
      console.log('Saving metadata for job:', jobId)

      // Check if metadata record already exists
      const { data: existingMetadata } = await supabase
        .from('file_metadata')
        .select('id')
        .eq('job_id', jobId)
        .single()

      const metadataData = {
        job_id: jobId,
        user_id: userId,
        file_path: job.file_path,
        file_name: job.file_name,
        exif_data: metadata.exif || null,
        iptc_data: metadata.iptc || null,
        xmp_data: metadata.xmp || null,
        file_info: metadata.fileInfo || null,
        analysis_results: metadata.analysisResults || null
      }

      let metadataError
      if (existingMetadata) {
        // Update existing metadata
        const { error } = await supabase
          .from('file_metadata')
          .update(metadataData)
          .eq('job_id', jobId)
        metadataError = error
      } else {
        // Insert new metadata
        const { error } = await supabase
          .from('file_metadata')
          .insert(metadataData)
        metadataError = error
      }

      if (metadataError) {
        console.error('Failed to save metadata:', metadataError)
        // Don't fail the request - job status is already updated
      } else {
        console.log('Metadata saved successfully for job:', jobId)
      }
    }

    console.log('Callback processed successfully for job:', jobId)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Callback processed successfully',
        jobId,
        status
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Callback function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})