import { useState, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Loader2, Upload, Film, Trash2, ChevronLeft, ChevronRight, Play, Download } from 'lucide-react';
import { toast } from 'sonner';

interface UploadedPhoto {
  id: string;
  name: string;
  url: string;
  file: File;
}

export default function Videos() {
  const { isAllowed, loading: guardLoading } = useRoleGuard(['admin', 'sdr', 'gerente'], '/dashboard');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [duration, setDuration] = useState([3]); // seconds per photo
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Selecione apenas arquivos de imagem');
      return;
    }

    const newPhotos: UploadedPhoto[] = imageFiles.map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      file,
    }));

    setPhotos(prev => [...prev, ...newPhotos]);
    setVideoUrl(null);
    toast.success(`${newPhotos.length} foto(s) adicionada(s)`);
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const filtered = prev.filter(p => p.id !== id);
      setPreviewIndex(i => Math.min(i, Math.max(0, filtered.length - 1)));
      return filtered;
    });
    setVideoUrl(null);
  };

  const movePhoto = (id: string, dir: -1 | 1) => {
    setPhotos(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const generateVideo = async () => {
    if (photos.length < 2) {
      toast.error('Adicione pelo menos 2 fotos para gerar o vídeo');
      return;
    }

    setGenerating(true);
    setVideoUrl(null);

    try {
      const canvas = canvasRef.current!;
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d')!;

      // @ts-ignore - MediaRecorder is available in modern browsers
      const stream = canvas.captureStream(30);
      // @ts-ignore
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e: any) => { if (e.data.size > 0) chunks.push(e.data); };

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.start();

        const drawPhotos = async () => {
          for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];
            const img = new Image();
            img.src = photo.url;

            await new Promise<void>(imgResolve => {
              img.onload = () => {
                const secPerPhoto = duration[0];
                const frames = secPerPhoto * 30;
                let frame = 0;

                const drawFrame = () => {
                  // Fade-in effect
                  const alpha = Math.min(1, frame / (frames * 0.3));
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.globalAlpha = 1;
                  ctx.fillStyle = '#000';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);

                  // Cover fill
                  const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
                  const w = img.width * scale;
                  const h = img.height * scale;
                  const x = (canvas.width - w) / 2;
                  const y = (canvas.height - h) / 2;

                  ctx.globalAlpha = alpha;
                  ctx.drawImage(img, x, y, w, h);

                  // Title overlay on first frame
                  if (title && i === 0) {
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 32px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(title, canvas.width / 2, canvas.height - 35);
                  }

                  frame++;
                  if (frame < frames) {
                    requestAnimationFrame(drawFrame);
                  } else {
                    imgResolve();
                  }
                };

                drawFrame();
              };
            });
          }

          recorder.stop();
        };

        drawPhotos();
      });

      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      toast.success('Vídeo gerado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar vídeo. Seu navegador pode não suportar gravação de canvas.');
    } finally {
      setGenerating(false);
    }
  };

  const downloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `${title || 'montagem'}-${Date.now()}.webm`;
    a.click();
  };

  if (guardLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const currentPhoto = photos[previewIndex];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Vídeos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Carregue fotos de clientes e gere uma montagem em vídeo para apresentações
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* Left: upload + settings */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload de Fotos
                </CardTitle>
                <CardDescription>
                  Carregue as fotos na ordem que devem aparecer no vídeo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-dashed h-20 flex-col gap-2"
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Clique para selecionar fotos (JPG, PNG, WEBP)</span>
                </Button>

                {photos.length > 0 && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {photos.map((photo, idx) => (
                      <div
                        key={photo.id}
                        className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                          idx === previewIndex ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                        }`}
                        onClick={() => setPreviewIndex(idx)}
                      >
                        <img src={photo.url} alt={photo.name} className="h-12 w-16 object-cover rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{photo.name}</p>
                          <p className="text-xs text-muted-foreground">Foto {idx + 1}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === 0}
                            onClick={(e) => { e.stopPropagation(); movePhoto(photo.id, -1); }}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === photos.length - 1}
                            onClick={(e) => { e.stopPropagation(); movePhoto(photo.id, 1); }}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Film className="h-4 w-4" />
                  Configurações do Vídeo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Título / Legenda (opcional)</Label>
                  <Input
                    placeholder="ex: Visita ao Cliente XYZ — Julho 2025"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">
                    Duração por foto: <span className="font-semibold text-primary">{duration[0]}s</span>
                  </Label>
                  <Slider
                    value={duration}
                    onValueChange={setDuration}
                    min={1}
                    max={8}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1s</span>
                    <span>Duração total: ~{photos.length * duration[0]}s</span>
                    <span>8s</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={generateVideo}
                  disabled={generating || photos.length < 2}
                >
                  {generating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando vídeo...</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Gerar Montagem</>
                  )}
                </Button>

                {photos.length < 2 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Adicione pelo menos 2 fotos para gerar o vídeo
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: preview */}
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Preview</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {currentPhoto ? (
                  <div className="relative">
                    <img
                      src={currentPhoto.url}
                      alt={currentPhoto.name}
                      className="w-full aspect-video object-cover"
                    />
                    {photos.length > 1 && (
                      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                        {photos.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setPreviewIndex(i)}
                            className={`w-2 h-2 rounded-full transition-colors ${
                              i === previewIndex ? 'bg-white' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-muted flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Film className="h-12 w-12 opacity-30" />
                    <p className="text-sm">Nenhuma foto carregada</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {videoUrl && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Film className="h-4 w-4 text-primary" />
                    Vídeo Gerado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <video
                    src={videoUrl}
                    controls
                    className="w-full rounded-md"
                    autoPlay
                  />
                  <Button className="w-full" onClick={downloadVideo} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Vídeo (.webm)
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Hidden canvas for video generation */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
