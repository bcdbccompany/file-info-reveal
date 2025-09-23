import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SupabaseUploadZone } from '@/components/SupabaseUploadZone';
import { MetadataDisplay } from '@/components/MetadataDisplay';

export default function Index() {
  const [metadata, setMetadata] = useState<any>({});
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleMetadataExtracted = (data: any) => {
    setMetadata(data.metadata || data);
    if (data.file) {
      setUploadedFile(data.file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Análise de Metadados de Imagem
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Sistema completo de extração e análise de metadados EXIF, IPTC e XMP
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Upload e Processamento</CardTitle>
              <CardDescription>
                Faça upload de uma imagem para análise completa de metadados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SupabaseUploadZone onMetadataExtracted={handleMetadataExtracted} />
            </CardContent>
          </Card>

          {/* Results */}
          {Object.keys(metadata).length > 0 && (
            <MetadataDisplay file={uploadedFile} metadata={metadata} />
          )}
        </div>
      </div>
    </div>
  );
}