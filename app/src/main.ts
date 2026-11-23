(() => {
  const $ = (id) => document.getElementById(id);

  const audio = $("audio");
  const fileInput = $("fileInput");
  const playlistEl = $("playlist");
  const emptyMsg = $("emptyMsg");
  const countEl = $("count");
  const titleEl = $("trackTitle");
  const subEl = $("trackSub");
  const playBtn = $("playBtn");
  const prevBtn = $("prevBtn");
  const nextBtn = $("nextBtn");
  const shuffleBtn = $("shuffleBtn");
  const repeatBtn = $("repeatBtn");
  const clearBtn = $("clearBtn");
  const seekBar = $("seekBar");
  const volumeBar = $("volumeBar");
  const curTimeEl = $("currentTime");
  const durEl = $("duration");
  const dropzone = $("dropzone");
  const canvas = $("visualizer");

  let tracks = [];          // { name, url }
  let current = -1;
  let shuffle = false;
  let repeat = "off";       // off | all | one
  let seeking = false;

  /* ---------- Icons ---------- */
  const ICON_PLAY  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function setPlayIcon(playing) {
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  /* ---------- Helpers ---------- */
  const fmt = (s) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const cleanName = (file) => file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");

  const setFill = (input) => {
    const min = +input.min || 0, max = +input.max || 100;
    input.style.setProperty("--fill", ((input.value - min) / (max - min)) * 100 + "%");
  };

  /* ---------- Loading files ---------- */
  function addFiles(fileList) {
    const files = [...fileList].filter(
      (f) => f.type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name)
    );
    if (!files.length) return;

    const wasEmpty = tracks.length === 0;
    files.forEach((f) => tracks.push({ name: cleanName(f), url: URL.createObjectURL(f) }));
    renderPlaylist();
    if (wasEmpty) loadTrack(0, false);
  }

  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = ""; // allow picking the same files again
  });

  // Drag & drop
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("dragging"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("dragging"); })
  );
  dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  /* ---------- Playlist UI ---------- */
  function renderPlaylist() {
    playlistEl.innerHTML = "";
    tracks.forEach((t, i) => {
      const li = document.createElement("li");
      if (i === current) li.classList.add("active");

      const idx = document.createElement("span");
      idx.className = "idx";
      idx.textContent = i + 1;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = t.name;

      const rm = document.createElement("button");
      rm.className = "remove";
      rm.title = "Remove";
      rm.textContent = "×";
      rm.addEventListener("click", (e) => { e.stopPropagation(); removeTrack(i); });

      li.append(idx, name, rm);
      li.addEventListener("click", () => loadTrack(i, true));
      playlistEl.appendChild(li);
    });
    countEl.textContent = `(${tracks.length})`;
    emptyMsg.classList.toggle("hidden", tracks.length > 0);
  }

  function removeTrack(i) {
    URL.revokeObjectURL(tracks[i].url);
    const wasPlaying = !audio.paused;
    tracks.splice(i, 1);

    if (!tracks.length) { clearAll(); return; }

    if (i === current) {
      current = Math.min(i, tracks.length - 1);
      loadTrack(current, wasPlaying);
    } else {
      if (i < current) current--;
      renderPlaylist();
    }
  }

  function clearAll() {
    tracks.forEach((t) => URL.revokeObjectURL(t.url));
    tracks = [];
    current = -1;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    titleEl.textContent = "No track loaded";
    subEl.textContent = "Add MP3 or FLAC files to start listening";
    seekBar.value = 0; setFill(seekBar);
    curTimeEl.textContent = "0:00";
    durEl.textContent = "0:00";
    setPlayIcon(false);
    renderPlaylist();
  }
  clearBtn.addEventListener("click", clearAll);

  /* ---------- Playback ---------- */
  function loadTrack(i, autoplay) {
    if (i < 0 || i >= tracks.length) return;
    current = i;
    audio.src = tracks[i].url;
    titleEl.textContent = tracks[i].name;
    subEl.textContent = `Track ${i + 1} of ${tracks.length}`;
    document.title = `${tracks[i].name} – Local Music Player`;
    renderPlaylist();
    if (autoplay) play();
  }

  function play() {
    if (!tracks.length) { fileInput.click(); return; }
    initAudioGraph();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    audio.play().catch((err) => console.warn("Playback blocked:", err));
  }

  function togglePlay() { audio.paused ? play() : audio.pause(); }

  function nextIndex(auto) {
    if (!tracks.length) return -1;
    if (shuffle && tracks.length > 1) {
      let n;
      do { n = Math.floor(Math.random() * tracks.length); } while (n === current);
      return n;
    }
    const n = current + 1;
    if (n < tracks.length) return n;
    return (repeat === "all" || !auto) ? 0 : -1;
  }

  function next() { const n = nextIndex(false); if (n >= 0) loadTrack(n, true); }

  function prev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const p = current - 1 < 0 ? tracks.length - 1 : current - 1;
    loadTrack(p, true);
  }

  playBtn.addEventListener("click", togglePlay);
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);

  audio.addEventListener("play", () => { setPlayIcon(true); drawLoop(); });
  audio.addEventListener("pause", () => { setPlayIcon(false); });

  audio.addEventListener("ended", () => {
    if (repeat === "one") { audio.currentTime = 0; play(); return; }
    const n = nextIndex(true);
    if (n >= 0) loadTrack(n, true);
    else setPlayIcon(false);
  });

  audio.addEventListener("loadedmetadata", () => {
    durEl.textContent = fmt(audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    if (seeking) return;
    curTimeEl.textContent = fmt(audio.currentTime);
    seekBar.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    setFill(seekBar);
  });

  audio.addEventListener("error", () => {
    subEl.textContent = "This file could not be played. Skipping may help.";
  });

  /* ---------- Seek & volume ---------- */
  seekBar.addEventListener("input", () => {
    seeking = true;
    setFill(seekBar);
    curTimeEl.textContent = fmt((seekBar.value / 100) * audio.duration);
  });
  seekBar.addEventListener("change", () => {
    if (audio.duration) audio.currentTime = (seekBar.value / 100) * audio.duration;
    seeking = false;
  });

  audio.volume = +volumeBar.value;
  volumeBar.addEventListener("input", () => {
    audio.volume = +volumeBar.value;
    setFill(volumeBar);
  });
  setFill(volumeBar);
  setFill(seekBar);

  /* ---------- Shuffle / repeat ---------- */
  shuffleBtn.addEventListener("click", () => {
    shuffle = !shuffle;
    shuffleBtn.setAttribute("aria-pressed", shuffle);
    shuffleBtn.textContent = shuffle ? "Shuffle: on" : "Shuffle";
  });

  repeatBtn.addEventListener("click", () => {
    repeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
    repeatBtn.textContent = `Repeat: ${repeat}`;
    repeatBtn.setAttribute("aria-pressed", repeat !== "off");
  });

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") { e.shiftKey ? next() : (audio.currentTime += 5); }
    else if (e.code === "ArrowLeft")  { e.shiftKey ? prev() : (audio.currentTime -= 5); }
    else if (e.code === "ArrowUp")    { volumeBar.value = Math.min(1, +volumeBar.value + 0.05); volumeBar.dispatchEvent(new Event("input")); }
    else if (e.code === "ArrowDown")  { volumeBar.value = Math.max(0, +volumeBar.value - 0.05); volumeBar.dispatchEvent(new Event("input")); }
  });

  /* ---------- Visualizer (Web Audio) ---------- */
  let audioCtx, analyser, dataArray, graphReady = false, drawing = false;
  const ctx2d = canvas.getContext("2d");

  function initAudioGraph() {
    if (graphReady) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
      analyser.connect(audioCtx.destination);
      graphReady = true;
    } catch (err) {
      console.warn("Visualizer unavailable:", err);
    }
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function drawLoop() {
    if (drawing) return;
    drawing = true;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

    const frame = () => {
      const w = canvas.width, h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      if (graphReady) {
        analyser.getByteFrequencyData(dataArray);
        const bars = dataArray.length;
        const gap = w * 0.006;
        const bw = (w - gap * (bars - 1)) / bars;
        ctx2d.fillStyle = accent;
        for (let i = 0; i < bars; i++) {
          const v = dataArray[i] / 255;
          const bh = Math.max(3, v * h * 0.75);
          ctx2d.globalAlpha = 0.25 + v * 0.75;
          ctx2d.fillRect(i * (bw + gap), h - bh, bw, bh);
        }
        ctx2d.globalAlpha = 1;
      }

      if (audio.paused) { drawing = false; return; }
      requestAnimationFrame(frame);
    };
    frame();
  }

  renderPlaylist();
})();
