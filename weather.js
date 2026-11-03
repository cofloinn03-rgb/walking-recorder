(() => {
    'use strict';
    const source = 'https://api.open-meteo.com/v1/forecast?latitude=53.3498&longitude=-6.2603&current=temperature_2m,precipitation,wind_speed_10m&timezone=GMT&timeformat=unixtime';
    const intervalMs = 60_000;
    window.mountWeather = ({getUser, save}) => {
        const $ = id => document.getElementById(id);
        const start = $('weather-start'), stop = $('weather-stop'), status = $('weather-status');
        let running = false, busy = false, timer, request, owner, generation = 0;
        let stored = 0;
        const show = message => { status.textContent = message; };
        function buttons() { start.disabled = running || busy || !getUser(); stop.disabled = !running; }
        function halt(message) {
            running = false; generation++; clearTimeout(timer); request?.abort();
            show(message); buttons();
        }
        async function poll(attempt) {
            if (!running || attempt !== generation) return;
            if (getUser()?.uid !== owner) { halt('Collector stopped. Sign in to start again.'); return; }
            busy = true; buttons();
            try {
                request = new AbortController();
                const deadline = setTimeout(() => request.abort(), 12_000);
                let body;
                try {
                    const response = await fetch(source, {signal: request.signal, cache: 'no-store'});
                    if (!response.ok) throw new Error(`Weather service returned HTTP ${response.status}`);
                    body = await response.json();
                } finally { clearTimeout(deadline); request = null; }
                if (!running || attempt !== generation || getUser()?.uid !== owner) return;
                const c = body.current;
                const units = body.current_units;
                if (!c || !Number.isSafeInteger(c.time) || !Number.isSafeInteger(c.interval) || c.interval <= 0 ||
                    ![c.temperature_2m,c.precipitation,c.wind_speed_10m,body.latitude,body.longitude].every(Number.isFinite) ||
                    units?.temperature_2m !== '°C' || units?.precipitation !== 'mm' || units?.wind_speed_10m !== 'km/h') {
                    throw new Error('Weather response is missing expected values or units');
                }
                const timeMs = c.time * 1000;
                if (timeMs < Date.now()-90*60_000 || timeMs > Date.now()+20*60_000) throw new Error('Weather timestamp is outside the current window, check the device clock');
                const record = {
                    provider: 'Open-Meteo', licence: 'CC BY 4.0', sourceUrl: source,
                    dataType: 'current weather model estimate', locationId: 'dublin-city-centre',
                    requestedLatitude: 53.3498, requestedLongitude: -6.2603,
                    gridLatitude: body.latitude, gridLongitude: body.longitude,
                    sourceTimeUtc: new Date(timeMs).toISOString(), collectedAtUtc: new Date().toISOString(),
                    intervalSeconds: c.interval, temperatureC: c.temperature_2m,
                    precipitationMm: c.precipitation, windSpeedKmh: c.wind_speed_10m
                };
                show('Waiting for Firebase to confirm the weather record…');
                const added = await save(owner, String(c.time), record);
                if (attempt !== generation) return;
                if (added) stored++;
                $('weather-count').textContent = String(stored);
                $('weather-latest').textContent = `${record.sourceTimeUtc} · ${record.temperatureC} °C · ${record.precipitationMm} mm precipitation · ${record.windSpeedKmh} km/h wind`;
                show(added ? 'New weather record saved, Checking again in about one minute.' : 'This source time is already saved, Checking again in about one minute.');
            } catch (error) {
                if (attempt === generation) show(`${error.name === 'AbortError' ? 'Weather request timed out' : error.message || 'Collection failed'}. Retrying in about one minute.`);
            } finally {
                busy = false; buttons();
                if (running && attempt === generation) timer = setTimeout(() => poll(attempt), intervalMs);
            }
        }
        start.addEventListener('click', () => {
            if (busy || running || !getUser()) return;
            owner = getUser().uid; running = true; stored = 0; $('weather-count').textContent = '0';
            $('weather-latest').textContent = ''; show('Fetching current Dublin City Centre weather…');
            poll(++generation);
        });
        stop.addEventListener('click', () => halt('Collector stopped. A write already sent to Firebase may still finish.'));
        buttons();
        return () => {
            if (running && getUser()?.uid !== owner) halt('Collector stopped because sign in changed.');
            else buttons();
        };
    };
})();
