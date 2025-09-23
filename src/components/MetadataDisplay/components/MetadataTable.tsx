import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { formatValue } from '../utils/formatters';
import { getIconForKey } from '../utils/iconMapper';
import type { FileMetadata } from '../types';

interface MetadataTableProps {
  metadata: FileMetadata;
}

export function MetadataTable({ metadata }: MetadataTableProps) {
  // Categorizar metadados
  const categorizeMetadata = () => {
    const categories: { [key: string]: { [key: string]: any } } = {
      'Arquivo': {},
      'Imagem': {},
      'EXIF': {},
      'Câmera': {},
      'Localização': {},
      'Software': {},
      'Segurança': {},
      'Outros': {}
    };

    Object.entries(metadata).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      
      if (lowerKey.includes('size') || lowerKey.includes('type') || lowerKey.includes('format') || 
          lowerKey.includes('encoding') || lowerKey.includes('entropy') || lowerKey.includes('hash')) {
        categories['Arquivo'][key] = value;
      } else if (lowerKey.includes('width') || lowerKey.includes('height') || lowerKey.includes('dimensions') || 
                 lowerKey.includes('resolution') || lowerKey.includes('dpi') || lowerKey.includes('color')) {
        categories['Imagem'][key] = value;
      } else if (lowerKey.includes('exif') || lowerKey.includes('orientation') || lowerKey.includes('compression')) {
        categories['EXIF'][key] = value;
      } else if (lowerKey.includes('make') || lowerKey.includes('model') || lowerKey.includes('lens') || 
                 lowerKey.includes('focal') || lowerKey.includes('aperture') || lowerKey.includes('exposure') || 
                 lowerKey.includes('iso') || lowerKey.includes('flash') || lowerKey.includes('metering')) {
        categories['Câmera'][key] = value;
      } else if (lowerKey.includes('gps') || lowerKey.includes('location') || lowerKey.includes('coordinates')) {
        categories['Localização'][key] = value;
      } else if (lowerKey.includes('software') || lowerKey.includes('application') || lowerKey.includes('creator') || 
                 lowerKey.includes('editor') || lowerKey.includes('processed')) {
        categories['Software'][key] = value;
      } else if (lowerKey.includes('signature') || lowerKey.includes('certificate') || lowerKey.includes('manifest') || 
                 lowerKey.includes('c2pa') || lowerKey.includes('authenticity')) {
        categories['Segurança'][key] = value;
      } else {
        categories['Outros'][key] = value;
      }
    });

    // Remover categorias vazias
    return Object.fromEntries(
      Object.entries(categories).filter(([, items]) => Object.keys(items).length > 0)
    );
  };

  const categorizedMetadata = categorizeMetadata();

  return (
    <Accordion type="multiple" className="w-full">
      {Object.entries(categorizedMetadata).map(([category, items]) => (
        <AccordionItem key={category} value={category}>
          <AccordionTrigger className="text-left">
            <span className="flex items-center gap-2">
              {category}
              <span className="text-xs text-muted-foreground">
                ({Object.keys(items).length} items)
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              {Object.entries(items).map(([key, value]) => {
                const Icon = getIconForKey(key);
                return (
                  <div key={key} className="flex items-start justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium break-words">{key}</span>
                    </div>
                    <span className="text-sm text-muted-foreground ml-2 break-all">
                      {formatValue(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}