import type { FileMetadata, RuleResult, CoOccurrenceBonus, ScoreResult } from '../types';

// Helper functions for scoring
const getCategoryFromExtension = (ext: string): string => {
  const categories: { [key: string]: string } = {
    // Imagens
    jpg: 'Imagem', jpeg: 'Imagem', png: 'Imagem', gif: 'Imagem', webp: 'Imagem', svg: 'Imagem', bmp: 'Imagem',
    // Documentos
    pdf: 'Documento', doc: 'Documento', docx: 'Documento', txt: 'Documento', rtf: 'Documento',
    // Planilhas
    xls: 'Planilha', xlsx: 'Planilha', csv: 'Planilha',
    // Apresentações  
    ppt: 'Apresentação', pptx: 'Apresentação',
    // Áudio
    mp3: 'Áudio', wav: 'Áudio', flac: 'Áudio', aac: 'Áudio', ogg: 'Áudio',
    // Vídeo
    mp4: 'Vídeo', avi: 'Vídeo', mov: 'Vídeo', wmv: 'Vídeo', mkv: 'Vídeo',
    // Comprimidos
    zip: 'Arquivo Comprimido', rar: 'Arquivo Comprimido', '7z': 'Arquivo Comprimido',
    // Código
    js: 'Código', ts: 'Código', html: 'Código', css: 'Código', json: 'Código', xml: 'Código'
  };
  return categories[ext] || 'Outro';
};

const generateSimpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8).toUpperCase();
};

// Funções auxiliares para verificação de regras baseadas no relatório ExifTools
const estimateExpectedFileSize = (metadata: FileMetadata): number | null => {
  const width = metadata['Largura (pixels)'] as number;
  const height = metadata['Altura (pixels)'] as number;
  if (width && height) {
    return (width * height * 0.3); // Fator de compressão médio JPEG
  }
  return null;
};

const checkEXIFMissing = (metadata: FileMetadata) => {
  const criticalEXIF = ['Make', 'Model', 'ISO', 'DateTimeOriginal', 'CreateDate'];
  let missingCount = 0;
  const missing = [];
  
  for (const field of criticalEXIF) {
    if (!metadata[field]) {
      missingCount++;
      missing.push(field);
    }
  }
  
  const detected = missingCount >= 3; // Se 3+ campos críticos estão ausentes
  return {
    detected,
    evidence: detected 
      ? `EXIF crítico ausente: ${missing.join(', ')}` 
      : 'EXIF presente e completo'
  };
};

const checkAdobeTags = (metadata: FileMetadata) => {
  // Whitelist de padrões conhecidos de firmware/sistema que devem ser excluídos
  const knownFirmwarePatterns = [
    /^[a-z]\d{3}[a-z]\d{2}[a-z]\d{1}$/i, // Samsung firmware pattern (ex: S916BXXS8DYG6)
    /^[a-z0-9]{10,15}$/i,                  // Generic firmware patterns
    /^build\s/i,                           // Build numbers
    /android/i,                            // Android system
    /ios/i,                                // iOS system
    /^[0-9]+\.[0-9]+/                      // Version numbers
  ];

  // Função para verificar se é firmware conhecido
  const isFirmware = (value: string) => {
    return knownFirmwarePatterns.some(pattern => pattern.test(value.trim()));
  };

  // Indicadores específicos de Adobe/Photoshop
  const realAdobeIndicators = [
    'app14flags', 'colortransform', 'app14', 'adobe', 'photoshop'
  ];
  
  for (const [key, value] of Object.entries(metadata)) {
    const keyStr = key.toLowerCase();
    const valueStr = String(value).toLowerCase();
    
    // Verificar se é firmware conhecido - se for, pular
    if (isFirmware(String(value))) {
      continue;
    }
    
    // 1. Busca por ICC Profile Hewlett-Packard (forte indicador Photoshop)
    if (valueStr.includes('hewlett-packard') || valueStr.includes('hp srgb') || 
        valueStr.includes('iec61966-2.1')) {
      return { detected: true, evidence: `ICC Profile Hewlett-Packard detectado em ${key}: ${value}` };
    }
    
    // 2. Busca por tags APP14 específicas
    if (keyStr.includes('app14') || valueStr.includes('app14flags') || 
        valueStr.includes('colortransform')) {
      return { detected: true, evidence: `Tag Adobe APP14 encontrada em ${key}: ${value}` };
    }
    
    // 3. Busca por Progressive DCT (mais específica - não apenas "progressive")
    if (valueStr.includes('progressive dct') || 
        (valueStr.includes('progressive') && (valueStr.includes('huffman') || valueStr.includes('dct')))) {
      return { detected: true, evidence: `Progressive DCT detectado em ${key}: ${value}` };
    }
    
    // 4. Busca específica por Adobe/Photoshop no Software (excluindo firmware)
    if (keyStr === 'software' && (valueStr.includes('adobe') || valueStr.includes('photoshop'))) {
      return { detected: true, evidence: `Software Adobe detectado: ${value}` };
    }
    
    // 5. Busca por outros indicadores Adobe específicos (não genéricos)
    for (const indicator of realAdobeIndicators) {
      if (keyStr.includes(indicator) || valueStr.includes(indicator)) {
        return { detected: true, evidence: `Indicador Adobe encontrado em ${key}: ${value}` };
      }
    }
  }
  
  return { detected: false, evidence: 'Nenhuma tag Adobe/Photoshop detectada' };
};

// Função específica para detectar Progressive DCT
const checkProgressiveDCT = (metadata: FileMetadata) => {
  for (const [key, value] of Object.entries(metadata)) {
    const valueStr = String(value).toLowerCase();
    if (valueStr.includes('progressive dct') || 
        (valueStr.includes('progressive') && valueStr.includes('huffman'))) {
      return { detected: true, evidence: `Progressive DCT encontrado em ${key}: ${value}` };
    }
  }
  return { detected: false, evidence: 'Baseline DCT (padrão câmera)' };
};

// Função específica para detectar YCbCr 4:4:4
const checkYCbCr444 = (metadata: FileMetadata) => {
  for (const [key, value] of Object.entries(metadata)) {
    const valueStr = String(value).toLowerCase();
    // Busca mais específica por YCbCr4:4:4
    if (valueStr.includes('ycbcr4:4:4') || valueStr.includes('ycbcr 4:4:4') ||
        (valueStr.includes('ycbcr') && valueStr.includes('4:4:4'))) {
      return { detected: true, evidence: `YCbCr 4:4:4 encontrado em ${key}: ${value}` };
    }
  }
  return { detected: false, evidence: 'YCbCr 4:2:0 ou não detectado' };
};

// Função específica para detectar ICC Profile Hewlett-Packard
const checkICCProfile = (metadata: FileMetadata) => {
  let points = 0;
  let evidence = 'ICC padrão câmera';
  
  for (const [key, value] of Object.entries(metadata)) {
    const valueStr = String(value).toLowerCase();
    
    // Prioridade máxima: Hewlett-Packard (forte indicador Photoshop)
    if (valueStr.includes('hewlett-packard') || valueStr.includes('hp srgb') ||
        valueStr.includes('iec61966-2.1')) {
      points = 3;
      evidence = `ICC Hewlett-Packard encontrado em ${key}: ${value}`;
      break;
    }
    // Adobe profiles
    else if (valueStr.includes('adobe')) {
      points = 3;
      evidence = `ICC Adobe encontrado em ${key}: ${value}`;
    }
    // Generic sRGB (menor peso)
    else if (valueStr.includes('srgb') && !valueStr.includes('google') && 
             !valueStr.includes('apple') && !valueStr.includes('samsung')) {
      if (points < 2) {
        points = 2;
        evidence = `ICC genérico encontrado em ${key}: ${value}`;
      }
    }
    // ICC ausente
    else if (key.toLowerCase().includes('icc') && (!value || valueStr === '')) {
      if (points < 3) {
        points = 3;
        evidence = 'ICC ausente';
      }
    }
  }
  
  return { detected: points > 0, points, evidence };
};

const checkSoftwareExplicit = (metadata: FileMetadata) => {
  const software = metadata['Software'] as string;
  if (software) {
    const softwareStr = software.toLowerCase();
    const editors = ['photoshop', 'photopea', 'canva', 'pixlr', 'fotor', 'befunky', 'gimp', 'ai'];
    
    for (const editor of editors) {
      if (softwareStr.includes(editor)) {
        return { detected: true, evidence: `Editor detectado: ${software}` };
      }
    }
  }
  
  return { detected: false, evidence: 'Software não detectado ou firmware câmera' };
};

const checkSoftwarePattern = (metadata: FileMetadata) => {
  const software = metadata['Software'] as string;
  const noExif = checkEXIFMissing(metadata).detected;
  const genericICC = checkICCProfile(metadata);
  
  // Padrão: Software vazio/genérico + EXIF ausente + ICC genérico
  const emptySoftware = !software || software.trim() === '';
  const isPattern = emptySoftware && noExif && (genericICC.points === 2 || genericICC.points === 3);
  
  return {
    detected: isPattern,
    evidence: isPattern 
      ? 'Padrão de editor online: Software vazio + EXIF ausente + ICC genérico'
      : 'Padrão normal de câmera'
  };
};

const checkDateInconsistency = (metadata: FileMetadata) => {
  const createDate = metadata['CreateDate'] as string;
  const modifyDate = metadata['ModifyDate'] as string;
  
  if (createDate && modifyDate) {
    const create = new Date(createDate);
    const modify = new Date(modifyDate);
    
    // Verificar se ModifyDate é significativamente posterior a CreateDate
    const diffMs = modify.getTime() - create.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffDays > 1) { // Mais de 1 dia de diferença
      return {
        detected: true,
        evidence: `ModifyDate ${diffDays.toFixed(0)} dias posterior à CreateDate`
      };
    }
  }
  
  return { detected: false, evidence: 'Datas coerentes' };
};

const checkAITags = (metadata: FileMetadata) => {
  // XMP e tags explícitas de IA
  const aiIndicators = [
    'google ai', 'ai-generated', 'artificial intelligence', 'midjourney',
    'dall-e', 'stable diffusion', 'generated by ai', 'ai-created'
  ];
  
  for (const [key, value] of Object.entries(metadata)) {
    const combined = `${key} ${value}`.toLowerCase();
    
    for (const indicator of aiIndicators) {
      if (combined.includes(indicator)) {
        return { detected: true, evidence: `IA detectada em ${key}: ${value}` };
      }
    }
  }
  
  return { detected: false, evidence: 'Nenhuma tag IA explícita encontrada' };
};

const checkC2PA = (metadata: FileMetadata) => {
  // C2PA/JUMBF é evidência inequívoca
  const c2paIndicators = ['c2pa', 'jumbf', 'manifest', 'provenance'];
  
  for (const [key, value] of Object.entries(metadata)) {
    const combined = `${key} ${value}`.toLowerCase();
    
    for (const indicator of c2paIndicators) {
      if (combined.includes(indicator)) {
        return { detected: true, evidence: `C2PA/JUMBF encontrado em ${key}: ${value}` };
      }
    }
  }
  
  return { detected: false, evidence: 'Nenhum manifesto C2PA/JUMBF encontrado' };
};

const checkDigitalTransport = (metadata: FileMetadata, rules: RuleResult[]): boolean => {
  // Padrões típicos de transporte digital (WhatsApp, Telegram, etc.)
  const transportIndicators = [
    'whatsapp', 'telegram', 'instagram', 'facebook', 'twitter', 
    'messenger', 'signal', 'viber'
  ];
  
  // Verificar se há evidências de transporte
  for (const [key, value] of Object.entries(metadata)) {
    const combined = `${key} ${value}`.toLowerCase();
    
    for (const indicator of transportIndicators) {
      if (combined.includes(indicator)) {
        return true;
      }
    }
  }
  
  // Padrão heurístico: EXIF parcial + sem software específico + sem C2PA
  const hasPartialExif = !checkEXIFMissing(metadata).detected;
  const noSpecificSoftware = !checkSoftwareExplicit(metadata).detected;
  const noC2PA = !checkC2PA(metadata).detected;
  const lowTechnicalScore = rules.filter(r => r.detected && 
    ['Progressive DCT', 'YCbCr 4:4:4', 'ICC Profile'].includes(r.category)
  ).length === 0;
  
  return hasPartialExif && noSpecificSoftware && noC2PA && lowTechnicalScore;
};


export const calculateAlterationScore = (metadata: FileMetadata): ScoreResult => {
  const rules: RuleResult[] = [];
  let totalScore = 0;
  
  // TABELA DE PESOS - Consolidada da matriz de validação
  
  // 1. Tamanho do Arquivo (Peso: 1 - Fraco)
  const fileSize = metadata['Tamanho'] || metadata['Tamanho do arquivo'] as number;
  const expectedSize = estimateExpectedFileSize(metadata);
  const sizeDifference = expectedSize ? Math.abs((Number(fileSize) - expectedSize) / expectedSize) : 0;
  const sizeSignificant = sizeDifference > 0.3; // 30% de diferença
  
  rules.push({
    category: 'Tamanho do Arquivo',
    detected: sizeSignificant,
    points: sizeSignificant ? 1 : 0,
    weight: 'Fraco',
    description: 'Aumento/redução significativa sem justificativa técnica',
    evidence: sizeSignificant ? `Diferença de ${(sizeDifference * 100).toFixed(1)}% do esperado` : 'Tamanho coerente'
  });
  if (sizeSignificant) totalScore += 1;
  
  // 2. Processo de Codificação (Peso: 3 - Médio)
  const progressiveDCT = checkProgressiveDCT(metadata);
  rules.push({
    category: 'Processo de Codificação',
    detected: progressiveDCT.detected,
    points: progressiveDCT.detected ? 3 : 0,
    weight: 'Médio',
    description: 'Progressive DCT indica reprocessamento',
    evidence: progressiveDCT.evidence
  });
  if (progressiveDCT.detected) totalScore += 3;
  
  // 3. Subamostragem de Cor (Peso: 3 - Médio)
  const ycbcr444 = checkYCbCr444(metadata);
  rules.push({
    category: 'Subamostragem de Cor',
    detected: ycbcr444.detected,
    points: ycbcr444.detected ? 3 : 0,
    weight: 'Médio',
    description: 'YCbCr 4:4:4 é incomum em câmeras',
    evidence: ycbcr444.evidence
  });
  if (ycbcr444.detected) totalScore += 3;
  
  // 4. Perfis ICC (Peso: 3 - Médio)
  const iccProfile = checkICCProfile(metadata);
  rules.push({
    category: 'Perfis ICC',
    detected: iccProfile.detected,
    points: iccProfile.detected ? iccProfile.points : 0,
    weight: 'Médio',
    description: 'ICC HP/Adobe ou ausente indica edição',
    evidence: iccProfile.evidence
  });
  if (iccProfile.detected) totalScore += iccProfile.points;
  
  // 5. EXIF (Peso: 4 - Forte)
  const exifMissing = checkEXIFMissing(metadata);
  rules.push({
    category: 'EXIF (Make/Model/ISO/etc.)',
    detected: exifMissing.detected,
    points: exifMissing.detected ? 4 : 0,
    weight: 'Forte',
    description: 'Ausência total é sinal fortíssimo em Online/IA',
    evidence: exifMissing.evidence
  });
  if (exifMissing.detected) totalScore += 4;
  
  // 6. Tags Adobe/Photoshop (Peso: 3 - Médio)
  const adobeTags = checkAdobeTags(metadata);
  rules.push({
    category: 'Tags Adobe/Photoshop',
    detected: adobeTags.detected,
    points: adobeTags.detected ? 3 : 0,
    weight: 'Médio',
    description: 'APP14, PhotoshopQuality típicos de Photoshop',
    evidence: adobeTags.evidence
  });
  if (adobeTags.detected) totalScore += 3;
  
  // 7. Software (Peso: 4 - Forte)
  const softwareExplicit = checkSoftwareExplicit(metadata);
  rules.push({
    category: 'Software (explícito)',
    detected: softwareExplicit.detected,
    points: softwareExplicit.detected ? 4 : 0,
    weight: 'Forte',
    description: 'Indício direto de edição no campo Software',
    evidence: softwareExplicit.evidence
  });
  if (softwareExplicit.detected) totalScore += 4;
  
  // 8. Software (vazio + padrões) (Peso: 2 - Médio)
  const softwarePattern = checkSoftwarePattern(metadata);
  rules.push({
    category: 'Software (padrão editor online)',
    detected: softwarePattern.detected,
    points: softwarePattern.detected ? 2 : 0,
    weight: 'Médio',
    description: 'Campo vazio + EXIF ausente/ICC genérico',
    evidence: softwarePattern.evidence
  });
  if (softwarePattern.detected) totalScore += 2;
  
  // 9. Datas (Peso: 3 - Médio)
  const dateInconsistency = checkDateInconsistency(metadata);
  rules.push({
    category: 'Datas (CreateDate/ModifyDate)',
    detected: dateInconsistency.detected,
    points: dateInconsistency.detected ? 3 : 0,
    weight: 'Médio',
    description: 'Incoerências são fortes indícios',
    evidence: dateInconsistency.evidence
  });
  if (dateInconsistency.detected) totalScore += 3;
  
  // 10. XMP/Tags IA (Peso: 5 - Muito Forte)
  const aiTags = checkAITags(metadata);
  rules.push({
    category: 'XMP/Tags IA explícitas',
    detected: aiTags.detected,
    points: aiTags.detected ? 5 : 0,
    weight: 'Muito Forte',
    description: 'Prova direta de IA (Google AI, etc.)',
    evidence: aiTags.evidence
  });
  if (aiTags.detected) totalScore += 5;
  
  // 11. C2PA/JUMBF (Peso: 5 - Muito Forte)
  const c2paTags = checkC2PA(metadata);
  rules.push({
    category: 'C2PA/JUMBF Manifest',
    detected: c2paTags.detected,
    points: c2paTags.detected ? 5 : 0,
    weight: 'Muito Forte',
    description: 'Evidência inequívoca de processamento IA',
    evidence: c2paTags.evidence
  });
  if (c2paTags.detected) totalScore += 5;
  
  // BÔNUS DE CO-OCORRÊNCIA
  const bonuses: CoOccurrenceBonus[] = [];
  
  // Bônus 1: Progressive DCT + YCbCr 4:4:4 (+2)
  if (progressiveDCT.detected && ycbcr444.detected) {
    bonuses.push({
      combination: 'Progressive DCT + YCbCr 4:4:4',
      detected: true,
      points: 2,
      description: 'Indica recompressão típica de software de edição'
    });
    totalScore += 2;
  }
  
  // Bônus 2: ICC HP/Adobe + Tags Adobe/Photoshop (+2)
  if (iccProfile.detected && adobeTags.detected) {
    bonuses.push({
      combination: 'Perfis ICC HP/Adobe + Tags Adobe/Photoshop',
      detected: true,
      points: 2,
      description: 'Padrão clássico de Photoshop/reexports Adobe'
    });
    totalScore += 2;
  }
  
  // Bônus 3: Datas incoerentes + Edição técnica (+2)
  if (dateInconsistency.detected && (progressiveDCT.detected || ycbcr444.detected || iccProfile.detected || adobeTags.detected)) {
    bonuses.push({
      combination: 'Datas incoerentes + Edição técnica',
      detected: true,
      points: 2,
      description: 'Combinação de alteração temporal com edição técnica'
    });
    totalScore += 2;
  }
  
  // Bônus 4: EXIF preservado + C2PA IA (+5)
  if (!exifMissing.detected && c2paTags.detected) {
    bonuses.push({
      combination: 'EXIF preservado + C2PA IA',
      detected: true,
      points: 5,
      description: 'Preservação de EXIF + Inserção explícita de C2PA IA'
    });
    totalScore += 5;
  }
  
  // VERIFICAÇÃO DE TRANSPORTE DIGITAL
  const isDigitalTransport = checkDigitalTransport(metadata, rules);
  let adjustedScore = totalScore;
  
  // Aplicar exceção de transporte digital
  if (isDigitalTransport && totalScore > 7) {
    adjustedScore = Math.min(totalScore, 7); // Máximo 7 pontos para transporte digital
  }
  
  // CLASSIFICAÇÃO FINAL
  let classification: string;
  let riskLevel: string;
  let confidenceLevel: string;
  
  if (adjustedScore <= 3) {
    classification = 'Baixo (normal)';
    riskLevel = 'Baixo';
    confidenceLevel = 'Alto';
  } else if (adjustedScore <= 7) {
    classification = 'Moderado (suspeita moderada)';
    riskLevel = 'Moderado';
    confidenceLevel = isDigitalTransport ? 'Moderado' : 'Alto';
  } else if (adjustedScore <= 12) {
    classification = 'Forte (suspeito)';
    riskLevel = 'Alto';
    confidenceLevel = 'Alto';
  } else {
    classification = 'Muito Forte (provável fraude)';
    riskLevel = 'Muito Alto';
    confidenceLevel = 'Muito Alto';
  }
  
  const explanation = generateExplanation(adjustedScore, isDigitalTransport, bonuses);
  
  return {
    totalScore,
    adjustedScore,
    classification,
    riskLevel,
    confidenceLevel,
    isDigitalTransport,
    rules: rules.filter(r => r.detected || r.points > 0), // Mostrar apenas regras relevantes
    bonuses,
    explanation
  };
};

const generateExplanation = (score: number, isDigitalTransport: boolean, bonuses: CoOccurrenceBonus[]): string => {
  let explanation = `Pontuação total: ${score} pontos. `;
  
  if (isDigitalTransport) {
    explanation += 'Padrão compatível com transporte digital (WhatsApp, Telegram, etc.). ';
  }
  
  if (bonuses.length > 0) {
    explanation += `Detectados ${bonuses.length} padrão(ões) de co-ocorrência que reforçam indícios. `;
  }
  
  if (score <= 3) {
    explanation += 'Arquivo apresenta características normais de documento original.';
  } else if (score <= 7) {
    explanation += 'Indícios isolados ou compatível com compressão/transporte digital.';
  } else if (score <= 12) {
    explanation += 'Conjunto consistente de indícios técnicos de manipulação.';
  } else {
    explanation += 'Múltiplos indícios técnicos indicam alta probabilidade de manipulação.';
  }
  
  return explanation;
};