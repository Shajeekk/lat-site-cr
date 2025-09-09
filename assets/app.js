const elements = {
  video: document.getElementById('video'),
  status: document.getElementById('status'),
  input: document.getElementById('stream-url'),
  btnPlay: document.getElementById('btn-play'),
  btnWillow: document.getElementById('btn-willow'),
  btnSky: document.getElementById('btn-sky'),
};

const PRESETS = {
  willow: '', // put your Willow .m3u8 URL here (or leave blank for manual)
  sky: '',    // put your SKY .m3u8 URL here
};

const PROXY_PREFIX = '/proxy/';

function setStatus(message, type = 'info') {
  elements.status.textContent = message || '';
  elements.status.style.color = type === 'error' ? '#ef4444' : '#a9b4cf';
}

function isHlsSupportedNatively() {
  const video = document.createElement('video');
  return video.canPlayType('application/vnd.apple.mpegurl') === 'probably' ||
         video.canPlayType('application/vnd.apple.mpegurl') === 'maybe';
}

function toProxyUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // Encode full absolute URL after /proxy/
    return `${PROXY_PREFIX}${encodeURIComponent(u.toString())}`;
  } catch {
    return '';
  }
}

function loadViaNativeHls(videoEl, url) {
  videoEl.src = url;
  const playPromise = videoEl.play();
  if (playPromise) {
    playPromise.catch(err => {
      setStatus(`Autoplay blocked: press Play. (${err?.message || 'error'})`, 'error');
    });
  }
}

function loadViaHlsJs(videoEl, url) {
  if (!window.Hls) {
    setStatus('Hls.js not loaded', 'error');
    return;
  }
  if (videoEl._hlsInstance) {
    videoEl._hlsInstance.destroy();
    videoEl._hlsInstance = null;
  }
  const hls = new Hls({
    maxBufferLength: 30,
    maxMaxBufferLength: 120,
    liveBackBufferLength: 30,
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 30,
    xhrSetup: (xhr, _url) => {
      xhr.withCredentials = false;
    }
  });

  hls.on(Hls.Events.ERROR, (_, data) => {
    const { type, details, fatal } = data;
    console.warn('HLS error:', type, details, data);
    setStatus(`${type}: ${details || ''}`, fatal ? 'error' : 'info');
    if (fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError();
          break;
        default:
          hls.destroy();
      }
    }
  });

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    setStatus('Manifest loaded. Starting playback…');
    videoEl.play().catch(() => {
      setStatus('Autoplay blocked: press Play button.', 'error');
    });
  });

  hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
    if (data?.details?.live) {
      setStatus('Live stream detected');
    }
  });

  hls.loadSource(url);
  hls.attachMedia(videoEl);
  videoEl._hlsInstance = hls;
}

function playStream(rawUrl) {
  setStatus('Loading stream…');
  const proxyUrl = toProxyUrl(rawUrl);
  if (!proxyUrl) {
    setStatus('Invalid URL', 'error');
    return;
  }

  const endsWithTs = rawUrl.trim().toLowerCase().endsWith('.ts');
  const isNative = isHlsSupportedNatively();

  const url = proxyUrl;

  if (endsWithTs) {
    elements.video.src = url;
    elements.video.play().catch(() => {
      setStatus('Autoplay blocked: press Play button.', 'error');
    });
    return;
  }

  if (isNative) {
    loadViaNativeHls(elements.video, url);
  } else {
    loadViaHlsJs(elements.video, url);
  }
}

elements.btnWillow.addEventListener('click', () => {
  if (!PRESETS.willow) {
    setStatus('No Willow URL configured. Paste one in the input.');
    return;
  }
  elements.input.value = PRESETS.willow;
  playStream(PRESETS.willow);
});

elements.btnSky.addEventListener('click', () => {
  if (!PRESETS.sky) {
    setStatus('No SKY URL configured. Paste one in the input.');
    return;
  }
  elements.input.value = PRESETS.sky;
  playStream(PRESETS.sky);
});

elements.btnPlay.addEventListener('click', () => {
  const url = elements.input.value.trim();
  if (!url) {
    setStatus('Please paste a .m3u8 or .ts URL', 'error');
    return;
  }
  playStream(url);
});

elements.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    elements.btnPlay.click();
  }
});

// Basic unload cleanup
window.addEventListener('beforeunload', () => {
  const hls = elements.video._hlsInstance;
  if (hls) hls.destroy();
});