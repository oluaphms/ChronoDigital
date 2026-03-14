/**
 * Serviço de reconhecimento facial para registro de ponto (SmartPonto).
 * Captura selfie via getUserMedia e compara com template cadastrado.
 * Para produção com FaceAPI.js ou TensorFlow.js: carregar modelos e gerar/comparar embeddings.
 */

export interface FaceVerificationResult {
  success: boolean;
  score: number;
  message?: string;
}

const FACE_MATCH_THRESHOLD = 0.6;

/**
 * Captura frame da câmera (selfie) como data URL.
 */
export function captureSelfie(video: HTMLVideoElement): Promise<string | null> {
  return new Promise((resolve) => {
    if (!video?.videoWidth) {
      resolve(null);
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Gera um "embedding" simplificado da imagem (hash perceptual básico).
 * Em produção: usar FaceAPI.js ou TensorFlow.js para gerar vetor facial real.
 */
function simpleImageDescriptor(dataUrl: string): string {
  const str = dataUrl.slice(0, 500) + dataUrl.length;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

/**
 * Compara dois descriptors e retorna score de similaridade 0–1.
 * Em produção: usar distância euclidiana ou cósseno entre embeddings reais.
 */
function compareDescriptors(descriptor1: string, descriptor2: string): number {
  if (!descriptor1 || !descriptor2) return 0;
  if (descriptor1 === descriptor2) return 1;
  const len = Math.min(descriptor1.length, descriptor2.length);
  let match = 0;
  for (let i = 0; i < len; i++) {
    if (descriptor1[i] === descriptor2[i]) match++;
  }
  return len ? match / Math.max(descriptor1.length, descriptor2.length) : 0;
}

/**
 * Verifica se a selfie capturada corresponde ao template do funcionário.
 * storedTemplate: template armazenado (employee_biometrics.face_template_encrypted ou descriptor).
 * capturedDataUrl: imagem capturada no momento do registro.
 *
 * Em produção: usar FaceAPI.js ou TensorFlow.js para:
 * 1) Gerar embedding facial da selfie
 * 2) Comparar com embedding armazenado (cosine similarity ou distância)
 */
export function verifyFaceMatch(
  storedTemplate: string | null | undefined,
  capturedDataUrl: string | null | undefined
): FaceVerificationResult {
  if (!capturedDataUrl) {
    return { success: false, score: 0, message: 'Nenhuma imagem capturada' };
  }

  const capturedDesc = simpleImageDescriptor(capturedDataUrl);

  if (!storedTemplate) {
    return {
      success: true,
      score: 1,
      message: 'Sem template cadastrado; registro apenas com foto',
    };
  }

  const score = compareDescriptors(storedTemplate, capturedDesc);
  const success = score >= FACE_MATCH_THRESHOLD;

  return {
    success,
    score,
    message: success ? undefined : 'Face não confere com o cadastro',
  };
}

/**
 * Inicializa câmera para captura (getUserMedia).
 */
export function startCamera(constraints?: MediaTrackConstraints): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.resolve(null);
  }
  return navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'user', ...constraints } })
    .then((stream) => stream)
    .catch(() => null);
}

/**
 * Retorna threshold configurável para comparação facial.
 */
export function getFaceMatchThreshold(): number {
  return FACE_MATCH_THRESHOLD;
}
