# Live-Gespräch (Beta): V2 und Legacy-V1

Der Live-Modus ist vollständig vom klassischen `/translator` getrennt. Die
zentrale Konstante `LIVE_PIPELINE` wählt explizit `v1` oder `v2`; Standard ist
`v2`. Innerhalb einer laufenden Session gibt es keinen automatischen Fallback.

## V2 (Standard)

V2 verwendet genau eine authoritative Source-Pipeline:

`Mikrofon → gpt-live-transcribe → Terra-Sprachklassifikation → Terra-Übersetzung → gpt-4o-mini-tts`

Die authentifizierte Route `/api/translator/live/v2/session` erstellt genau ein
kurzlebiges Secret für eine allgemeine Realtime-Session vom Typ
`transcription`. Der Browser verbindet per WebRTC über
`POST /v1/realtime/calls`. Die Session erhält die dokumentierten Language-Hints
`de` und `sw`, kompakte Kiswahili-Keywords und einen Transkriptionskontext. Die
serverseitige Turn Detection ist deaktiviert; die bestehende lokale 1000-ms-VAD
sendet am Turn-Ende `input_audio_buffer.commit`. Es wird kein Audio hochgeladen
und keine zweite STT-Anfrage ausgeführt.

Das finale Ereignis
`conversation.item.input_audio_transcription.completed` liefert das einzige
`authoritativeTranscript`. Nur dieses Transkript ist sichtbar, wird klassifiziert,
übersetzt und im lokalen V2-Report gespeichert. `expectedLanguage` ist lediglich
ein schwacher Hinweis aus der Gegenrichtung des vorherigen Turns; klare aktuelle
Erkennung gewinnt. `unknown` wird nicht übersetzt.

Die Übersetzung verwendet den unveränderten strikten Interpreter-Prompt des
klassischen Translators mit `gpt-5.6-terra`. Die Sprachausgabe verwendet dessen
Stimme und `gpt-4o-mini-tts`; das lokale Tempo liegt zwischen 0,8x und 1,2x.
Während TTS und Playback bleibt die MediaStream-Session bestehen, der Mikrofon-
Track ist jedoch deaktiviert. Dadurch kann die App-Ausgabe keinen neuen Turn
committen. Nach Playback-Ende wird derselbe Track sofort wieder aktiviert.

Der lokale Export trägt `pipelineVersion: "v2"` und enthält ausschließlich das
authoritative Transkript, Klassifikation, Übersetzung, Modelle, Tempo und die
V2-Zeitpunkte/-Dauern. Er enthält keine Secrets, Header, Prompts, SDP, Roh-Audios
oder V1-Sidecar-Strukturen.

## V1 (Legacy)

## Realtime-Pfad

- Modell: `gpt-realtime-translate`
- Browsertransport: WebRTC über `POST /v1/realtime/translations/calls`
- Authentifizierung: zwei kurzlebige Client-Secrets aus der authentifizierten Serverroute `/api/translator/live/session`
- Quelltranskript: `gpt-realtime-whisper`
- DataChannel: `session.input_transcript.delta` und `session.output_transcript.delta` für Quell- und Zieltranskript sowie Session-Lifecycle-/Fehlerereignisse
- Audio bei WebRTC: ein Remote-`MediaStreamTrack`; `session.output_audio.delta` ist der dokumentierte PCM-Pfad für WebSocket-Clients und wird im Browser-WebRTC-Pfad nicht als Audioquelle verwendet

Der Standard-OpenAI-Key bleibt ausschließlich auf dem Server. Production-Logs enthalten nur sichere Fehlercodes, Zielsprachen und Performance-Metriken, keine Transkripte oder Audioinhalte.

## Verbindungsaufbau und Development-Diagnose

Die Browser-Verbindung läuft je Sidecar in dieser Reihenfolge: Client Secret aus
der Serverroute übernehmen, `RTCPeerConnection` erzeugen, Mikrofontrack
hinzufügen, DataChannel `oai-events` anlegen, Offer und Local Description
erzeugen, das Offer-SDP als `application/sdp` an
`/v1/realtime/translations/calls` senden, das Answer-SDP als Remote Description
setzen und auf den offenen DataChannel warten. Erst wenn beide Sidecars diesen
Punkt erreicht haben, meldet die UI die Verbindung als bereit. Der Remote-Audio-
Track trifft üblicherweise erst mit der Audioausgabe ein und ist deshalb keine
Startvoraussetzung.

Die beiden Sidecars erzeugen keinen parallelen Call-Burst: `→ sw` wird zuerst
bis `connection_ready` aufgebaut, anschließend folgt `→ de`. Ein HTTP 429 beim
SDP-Call wird ausschließlich für den betroffenen Sidecar begrenzt wiederholt
(1, 2 und 4 Sekunden Backoff; insgesamt höchstens vier HTTP-Versuche). Ein
gültiger `Retry-After`-Wert bis 30 Sekunden hat Vorrang. Andere HTTP-Fehler
werden nicht automatisch wiederholt. Das bereits verbundene erste Sidecar
bleibt während des Backoffs aktiv; erst ein endgültiger Fehler löst den
gemeinsamen Cleanup aus. Das kurzlebige Secret wird für diese Versuche
wiederverwendet: Translation-Secrets dürfen laut API bis zu ihrem Ablauf mehrere
Sessions erzeugen. Stop, Reconnect und Unmount brechen Fetch und Backoff über
den startgebundenen `AbortController` ab.

Beide Remote-Tracks sind an dauerhaft stumme, per Start-Geste aktivierte
`HTMLAudioElement`-Sinks gebunden. Pro lokal erkanntem Turn werden beide
Remote-Spuren temporär aufgezeichnet. Erst nach der Spracherkennung erhält
ausschließlich der ausgewählte Sidecar-Blob eine eigene hörbare
`HTMLAudioElement.play()`-Wiedergabe; die verworfene Richtung bleibt stumm und
wird nie abgespielt. Dieser lokale Gate-Pfad verhindert doppeltes beziehungsweise
falschsprachiges Audio, ohne eine zweite Übersetzung oder TTS anzufordern.

Im Development protokolliert `[translator-live][connection]` jeden dieser
Schritte getrennt für `targetLanguage: "sw"` und `targetLanguage: "de"`.
`[translator-live][webrtc state]` enthält Connection-, ICE-, Signaling- und
ICE-Gathering-State. HTTP-Fehler enthalten nur Status, Content-Type,
Leer/Nicht-leer sowie die sicheren OpenAI-Fehlerfelder. Client Secrets,
Authorization Header, SDP, Audio und Gesprächsinhalte werden nicht geloggt.

## Warum zwei Sessions?

Eine Translation-Session hat laut aktueller API genau eine konfigurierte Zielsprache. Es gibt keinen dokumentierten bidirektionalen AUTO-Modus. Deshalb laufen zwei feste Sidecar-Sessions (`→ sw` und `→ de`). Beide erhalten den gemeinsamen Smartphone-Mikrofontrack. Die Ausgaben werden pro Turn gepuffert; nach konservativer DE/SW/unknown-Erkennung wird nur die korrekte Gegenrichtung abgespielt. Die andere Spur wird verworfen.

OpenAI empfiehlt für echte Calls getrennte Teilnehmertracks. Ein gemeinsames Smartphone liefert diese Trennung technisch nicht. Der gepufferte Phase-1-Pfad priorisiert deshalb korrekte Richtung und Echo-Sicherheit vor maximal aggressiver Streaming-Wiedergabe und verursacht doppelte Realtime-Audioverarbeitung.

## Turn Detection und Echo-Schutz

Realtime Translation unterstützt derzeit nicht die `server_vad`-/`semantic_vad`-Konfiguration der Assistant-Sessions und liefert keine Turn-Complete-Events. Die App segmentiert Turns deshalb lokal über den Mikrofonpegel; alle Schwellen liegen zentral in `config.ts`.

Während der eigenen Audioausgabe ist der Mikrofontrack deaktiviert. Zusätzlich fordert die App `echoCancellation`, `noiseSuppression` und `autoGainControl` an. Die WebRTC-Sessions bleiben bestehen und werden nicht pro Turn neu aufgebaut.

Der aktuelle Beta-Default für eine abgeschlossene Sprechpause ist zentral als
`LIVE_TURN_SILENCE_MS = 1000` konfiguriert. Ein Turn startet erst nach mehreren
aufeinanderfolgenden Sprachframes und wird nur als echte Sprache abgeschlossen,
wenn mindestens 300 ms aktive Sprachzeit gesammelt wurden. Kürzere Aktivität
wird als verworfener Geräusch-Turn protokolliert und nicht übersetzt.

## Lokales Beta-Testprotokoll

Jeder begonnene Turn erhält eine `turnId` und bleibt auch bei `unknown`, leerem
Transkript, Detect-Fehler, Verwerfen oder technischem Fehler im lokalen
Session-Protokoll. Input-Transcript-Kandidaten werden aus beiden Sidecars
gesammelt; der längste nicht-leere Kandidat wird zur Erkennung geschickt. Ist
kein Kandidat vorhanden, wird kein ungültiger `/detect`-Request gesendet.

Der bewusste Button **Testreport exportieren** erzeugt ausschließlich lokal
eine JSON-Datei mit Session-Metadaten, Turnstatus, Transkripten und Timings.
Die Sidecar-QA-Daten enthalten für beide Richtungen getrennte Quell- und
Zieltranskripte, Zeitpunkte des ersten/letzten beobachteten Transcript-Deltas,
Remote-Track-/Frame-Indikatoren, Recording-Status, Blob-Größe und einen sicheren
Audiofehlercode. Da die API kein Transcript-Complete-Event liefert, bezeichnet
`transcriptCompletedAt` den Zeitpunkt des letzten lokal beobachteten Deltas.
Signierte `firstTranslationRelativeToSpeechEndMs`- und
`firstAudioRelativeToSpeechEndMs`-Werte erhalten den Streaming-Vorsprung vor dem
lokalen Turn-Ende; die bisherigen nicht-negativen Felder bleiben kompatibel.
Audio, Client Secrets, API Keys, Auth-Header, Prompts und SDP werden weder in
den Report aufgenommen noch automatisch persistiert.

## Dolmetscher-Treue

Translation-Sessions unterstützen kein freies Instructions-Feld. Das ist beabsichtigt: der Endpoint ist ein kontinuierlicher Interpreter und besitzt weder Tools noch `response.create` oder Assistant-Turns. Gesprochene Anweisungen bleiben Audio-/Transkriptinhalt. Die separate Sprachklassifikation darf per strikt strukturiertem Schema ausschließlich `de`, `sw` oder `unknown` liefern und kann daher das Gespräch nicht beantworten oder fortsetzen.

## Voraussetzungen

- Server-only `OPENAI_API_KEY` (niemals `NEXT_PUBLIC_OPENAI_API_KEY`)
- Projektzugriff auf `gpt-realtime-translate`, `gpt-realtime-whisper` und `gpt-5.6-terra`
- HTTPS beziehungsweise `localhost` für Mikrofonzugriff
- Browser mit WebRTC, Web Audio und `MediaRecorder` (aktuelle Safari-/iOS-, Chrome- oder Edge-Version)
