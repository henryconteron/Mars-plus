// Equirectangular Leaflet view of the same dust grid the 3D globe draws.
// The image's top row is north, matching the volume layout.

export function createDustFlatMap(container) {
  const L = window.L;
  const map = L.map(container, {
    crs: L.CRS.EPSG4326,
    minZoom: 0,
    maxZoom: 5,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: false,
  });
  const fit = () => {
    map.invalidateSize();
    const zoom = map.getBoundsZoom([[-90, -180], [90, 180]], false);
    map.setView([0, 0], Number.isFinite(zoom) ? zoom : 1);
  };
  fit();
  const canvas = document.createElement('canvas');
  const overlay = L.imageOverlay('', [[-90, -180], [90, 180]], { opacity: 0.92, interactive: false }).addTo(map);
  const marker = L.circleMarker([18.4446, 77.4509], {
    radius: 6, color: '#ffffff', weight: 2, fillColor: '#5ec8f2', fillOpacity: 1,
  }).addTo(map);

  return {
    setPixels(rgba, width, height) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      overlay.setUrl(canvas.toDataURL('image/png'));
    },
    setAttribution() { fit(); },
    setMarker(lat, lon, text) { marker.setLatLng([lat, lon]); marker.bindTooltip(text, { permanent: true, direction: 'right', className: 'dust-tip' }); },
    invalidate() { fit(); },
  };
}
