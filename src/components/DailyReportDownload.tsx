import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { validateImageMetadata } from '@/utils/exifValidation';
import { toast } from 'sonner';

export function DailyReportDownload() {
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);
    
    try {
      // Get today's date range in local timezone
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const { data, error } = await supabase
        .from('file_metadata')
        .select('*')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.info('Nenhum registro encontrado para hoje');
        return;
      }

      const csvContent = generateCSV(data);
      downloadCSV(csvContent, `relatorio_metadados_${formatDate(today)}.csv`);
      
      toast.success(`Relatório exportado com ${data.length} registro(s)`);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro ao gerar relatório');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR');
  };

  const getLevelLabel = (level: number): string => {
    switch (level) {
      case 0: return 'Baixo Risco';
      case 1: return 'Risco Moderado';
      case 2: return 'Alto Risco';
      case 3: return 'Risco Muito Alto';
      default: return 'Desconhecido';
    }
  };

  const generateCSV = (data: any[]) => {
    const headers = [
      'Nome do Arquivo',
      'Data/Hora da Análise',
      'Tamanho (KB)',
      'Tipo',
      'Nível de Risco',
      'Classificação',
      'Score',
      'Câmera',
      'Data de Captura',
      'Sinais Positivos',
      'Sinais de Risco',
      'Recomendação'
    ];

    const rows = data.map(record => {
      const exifData = record.exif_raw || record.exif_data || {};
      const validation = validateImageMetadata(exifData);
      
      const camera = [
        exifData['IFD0:Make'] || exifData['Make'] || '',
        exifData['IFD0:Model'] || exifData['Model'] || ''
      ].filter(Boolean).join(' ').trim() || 'N/A';

      const captureDate = exifData['ExifIFD:DateTimeOriginal'] || 
                          exifData['DateTimeOriginal'] || 
                          exifData['EXIF:DateTimeOriginal'] || 'N/A';

      const positiveSignals = validation.positiveSignals.length > 0 
        ? validation.positiveSignals.join(' | ') 
        : 'Nenhum';

      const riskSignals = validation.riskSignals.length > 0 
        ? validation.riskSignals.join(' | ') 
        : 'Nenhum';

      return [
        record.file_name,
        formatDateTime(record.created_at),
        record.size_bytes ? (record.size_bytes / 1024).toFixed(2) : 'N/A',
        record.mime_type || 'N/A',
        validation.level,
        getLevelLabel(validation.level),
        validation.score.toFixed(0),
        camera,
        captureDate,
        positiveSignals,
        riskSignals,
        validation.recommendation
      ];
    });

    // UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF';
    const csvRows = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ];

    return BOM + csvRows.join('\n');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      onClick={handleDownload}
      disabled={isLoading}
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Baixar Relatório do Dia
    </Button>
  );
}
