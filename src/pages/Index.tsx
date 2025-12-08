import { useState } from 'react';
import { FileSearch, ChevronLeft, ChevronRight } from 'lucide-react';
import FileUploadZone from '@/components/FileUploadZone';
import ExifToolMetadataDisplay from '@/components/ExifToolMetadataDisplay';
import { Button } from '@/components/ui/button';

interface FileUploadResult {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  data?: any;
  error?: string;
}

const Index = () => {
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadResult[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  const handleFilesUpload = (results: FileUploadResult[]) => {
    setUploadedFiles(results);
    setCurrentFileIndex(0);
  };

  const handleRemoveFiles = () => {
    setUploadedFiles([]);
    setCurrentFileIndex(0);
  };

  const successFiles = uploadedFiles.filter(f => f.status === 'success');
  const currentFile = successFiles[currentFileIndex];

  const goToPrevious = () => {
    setCurrentFileIndex(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentFileIndex(prev => Math.min(successFiles.length - 1, prev + 1));
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
                Extraia e visualize metadados completos de até 10 arquivos
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
              onFilesUpload={handleFilesUpload}
              uploadedFiles={uploadedFiles.length > 0 ? uploadedFiles : undefined}
              onRemoveFiles={handleRemoveFiles}
            />
          </div>

          {/* Navigation for multiple files */}
          {successFiles.length > 1 && (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevious}
                disabled={currentFileIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Arquivo {currentFileIndex + 1} de {successFiles.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNext}
                disabled={currentFileIndex === successFiles.length - 1}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Current file name indicator */}
          {currentFile && (
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                {currentFile.file.name}
              </p>
            </div>
          )}

          {/* Results Section */}
          {currentFile && (
            <div className="w-full flex justify-center animate-in fade-in duration-500">
              <ExifToolMetadataDisplay metadata={currentFile.data} />
            </div>
          )}

          {/* Info Section (when no file is uploaded) */}
          {uploadedFiles.length === 0 && (
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
                  <h3 className="font-semibold text-foreground">Análise em Lote</h3>
                  <p className="text-sm text-muted-foreground">
                    Processe até 10 arquivos simultaneamente
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
