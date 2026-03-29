import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { useState, useRef } from 'react';
import { Button } from './ui/button';

interface VideoPlayerProps {
  src: string;
  className?: string;
}

export function VideoPlayer({ src, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        src={src}
        className="w-full h-auto"
        onEnded={() => setIsPlaying(false)}
        data-testid="video-player"
      >
        <source src={src} type="video/quicktime" />
        <source src={src} type="video/mp4" />
        <source src={src} type="video/webm" />
        Your browser does not support the video tag.
      </video>
      
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlay}
            className="text-white hover:bg-white/20"
            data-testid="button-play-pause"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMute}
            className="text-white hover:bg-white/20"
            data-testid="button-mute"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="text-white hover:bg-white/20"
            data-testid="button-fullscreen"
          >
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
