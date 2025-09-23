import { useState } from 'react';
import { FileSearch } from 'lucide-react';
import FileUploadZone from '@/components/FileUploadZone';
import MetadataDisplay from '@/components/MetadataDisplay';

const Index = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleFileUpload = (file: File) => {
    setUploadedFile(file);
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-primary rounded-lg">
              <FileSearch className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Analisador de Metadados
              </h1>
              <p className="text-muted-foreground text-sm">
                Extraia e visualize metadados completos de qualquer arquivo
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="flex flex-col items-center space-y-8">
          
          {/* Upload Section */}
          <div className="w-full flex justify-center">
            <FileUploadZone
              onFileUpload={handleFileUpload}
              uploadedFile={uploadedFile}
              onRemoveFile={handleRemoveFile}
            />
          </div>

          {/* Results Section */}
          {uploadedFile && (
            <div className="w-full flex justify-center animate-in fade-in duration-500">
              <MetadataDisplay file={uploadedFile} />
            </div>
          )}

          {/* Info Section (when no file is uploaded) */}
          {!uploadedFile && (
            <div className="max-w-2xl text-center space-y-6 animate-in fade-in duration-300">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold text-foreground">
                  Descubra tudo sobre seus arquivos
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Nossa ferramenta extrai e exibe todos os metadados disponíveis dos seus arquivos,
                  incluindo informações como nome, tamanho, tipo, data de modificação e muito mais.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mt-8">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <FileSearch className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Análise Completa</h3>
                  <p className="text-sm text-muted-foreground">
                    Extração de todos os metadados disponíveis
                  </p>
                </div>
                
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <FileSearch className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Qualquer Formato</h3>
                  <p className="text-sm text-muted-foreground">
                    Suporte para diversos tipos de arquivo
                  </p>
                </div>
                
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                    <FileSearch className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Interface Intuitiva</h3>
                  <p className="text-sm text-muted-foreground">
                    Visualização clara e organizada
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;