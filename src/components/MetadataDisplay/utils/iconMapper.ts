import { 
  FileText, Calendar, HardDrive, Hash, Image, MapPin, 
  Camera, Palette, Zap, AlertTriangle, CheckCircle 
} from 'lucide-react';

export const getIconForKey = (key: string) => {
  const lowerKey = key.toLowerCase();
  
  if (lowerKey.includes('date') || lowerKey.includes('time') || lowerKey.includes('created') || lowerKey.includes('modified')) {
    return Calendar;
  }
  if (lowerKey.includes('size') || lowerKey.includes('bytes') || lowerKey.includes('length')) {
    return HardDrive;
  }
  if (lowerKey.includes('hash') || lowerKey.includes('checksum') || lowerKey.includes('signature')) {
    return Hash;
  }
  if (lowerKey.includes('width') || lowerKey.includes('height') || lowerKey.includes('dimensions') || 
      lowerKey.includes('resolution') || lowerKey.includes('dpi')) {
    return Image;
  }
  if (lowerKey.includes('gps') || lowerKey.includes('location') || lowerKey.includes('coordinates')) {
    return MapPin;
  }
  if (lowerKey.includes('camera') || lowerKey.includes('make') || lowerKey.includes('model') || 
      lowerKey.includes('lens') || lowerKey.includes('focal') || lowerKey.includes('aperture') || 
      lowerKey.includes('exposure') || lowerKey.includes('iso') || lowerKey.includes('flash')) {
    return Camera;
  }
  if (lowerKey.includes('color') || lowerKey.includes('profile') || lowerKey.includes('space') || 
      lowerKey.includes('white') || lowerKey.includes('saturation')) {
    return Palette;
  }
  if (lowerKey.includes('entropy') || lowerKey.includes('compression') || lowerKey.includes('quality')) {
    return Zap;
  }
  
  return FileText;
};