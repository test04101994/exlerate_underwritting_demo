import { useState, useEffect } from 'react'
import { MapPin, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PropertyMapCardProps {
  location?: string | null
  className?: string
}

export function PropertyMapCard({ location, className = '' }: PropertyMapCardProps) {
  const [mapKey, setMapKey] = useState(0)
  const [iframeError, setIframeError] = useState(false)

  // Reset error state when location changes
  useEffect(() => {
    setIframeError(false)
  }, [location])

  if (!location || !location.trim()) {
    return (
      <div className={`flex flex-col items-center justify-center h-full bg-muted/30 rounded-lg border border-dashed border-border ${className}`}>
        <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Property Map</p>
        <p className="text-xs text-muted-foreground/70 mt-1 text-center px-4">
          Enter property address or ZIP code in the data extraction form to see the location
        </p>
      </div>
    )
  }

  const encodedQuery = encodeURIComponent(location.trim())
  const mapSrc = `https://maps.google.com/maps?q=${encodedQuery}&output=embed&zoom=14`
  const mapsLink = `https://www.google.com/maps/search/${encodedQuery}`

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">{location}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Refresh map"
            onClick={() => { setMapKey(k => k + 1); setIframeError(false) }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Open in Google Maps"
            onClick={() => window.open(mapsLink, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Map iframe */}
      <div className="flex-1 relative min-h-0">
        {iframeError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30 p-4">
            <MapPin className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground text-center mb-3">
              Map preview unavailable.<br />Click below to open in Google Maps.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => window.open(mapsLink, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3 w-3 mr-1.5" />
              Open in Google Maps
            </Button>
          </div>
        ) : (
          <iframe
            key={mapKey}
            src={mapSrc}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map of ${location}`}
            onError={() => setIframeError(true)}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        )}
      </div>
    </div>
  )
}
