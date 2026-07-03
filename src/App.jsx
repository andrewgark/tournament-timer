import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'tournament-timer-settings'

const DEFAULT_SETTINGS = {
  totalRounds: 8,
  roundDurationMinutes: 30,
  breakDurationMinutes: 5,
  breakEveryRounds: 1,
  breakLabel: 'Break',
  breakAfterLastRound: false,
  flashUnderTwoMinutes: true,
}

function normalizeBreakLabel(label) {
  const normalized = String(label || '').trim()

  if (!normalized || normalized.toLowerCase() === 'перерыв') {
    return DEFAULT_SETTINGS.breakLabel
  }

  return normalized
}

function toDraft(settings) {
  return {
    totalRounds: String(settings.totalRounds),
    roundDurationMinutes: String(settings.roundDurationMinutes),
    breakDurationMinutes: String(settings.breakDurationMinutes),
    breakEveryRounds: String(settings.breakEveryRounds),
    breakLabel: settings.breakLabel,
    breakAfterLastRound: settings.breakAfterLastRound,
    flashUnderTwoMinutes: settings.flashUnderTwoMinutes,
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, parsed))
}

function sanitizeDraft(draft) {
  return {
    totalRounds: clampNumber(
      draft.totalRounds,
      1,
      200,
      DEFAULT_SETTINGS.totalRounds,
    ),
    roundDurationMinutes: clampNumber(
      draft.roundDurationMinutes,
      1,
      600,
      DEFAULT_SETTINGS.roundDurationMinutes,
    ),
    breakDurationMinutes: clampNumber(
      draft.breakDurationMinutes,
      1,
      180,
      DEFAULT_SETTINGS.breakDurationMinutes,
    ),
    breakEveryRounds: clampNumber(
      draft.breakEveryRounds,
      1,
      200,
      DEFAULT_SETTINGS.breakEveryRounds,
    ),
    breakLabel: normalizeBreakLabel(draft.breakLabel),
    breakAfterLastRound: Boolean(draft.breakAfterLastRound),
    flashUnderTwoMinutes: Boolean(draft.flashUnderTwoMinutes),
  }
}

function loadInitialSettings() {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return DEFAULT_SETTINGS
    }

    return sanitizeDraft(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

function buildPhases(settings) {
  const phases = []
  let breakIndex = 0

  for (let roundNumber = 1; roundNumber <= settings.totalRounds; roundNumber += 1) {
    phases.push({
      id: `round-${roundNumber}`,
      type: 'round',
      roundNumber,
      label: `Round ${roundNumber}`,
      durationMs: settings.roundDurationMinutes * 60 * 1000,
    })

    const isLastRound = roundNumber === settings.totalRounds
    const shouldAddBreak = isLastRound
      ? settings.breakAfterLastRound
      : roundNumber % settings.breakEveryRounds === 0

    if (shouldAddBreak) {
      breakIndex += 1
      phases.push({
        id: `break-${breakIndex}`,
        type: 'break',
        breakNumber: breakIndex,
        label: settings.breakLabel,
        durationMs: settings.breakDurationMinutes * 60 * 1000,
      })
    }
  }

  return phases
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getPrimaryButtonLabel(isRunning, isComplete, remainingMs, phaseDurationMs) {
  if (isComplete) {
    return 'Restart'
  }

  if (isRunning) {
    return 'Running'
  }

  return remainingMs === phaseDurationMs ? 'Start' : 'Resume'
}

const SettingsPanel = memo(function SettingsPanel({
  draftSettings,
  handleDraftChange,
  applySettings,
}) {
  return (
    <aside className="settings-panel">
      <form className="settings-card" onSubmit={applySettings}>
        <div className="settings-heading">
          <h1>Tournament Settings</h1>
          <p>Changes are applied by restarting the round and break sequence.</p>
        </div>

        <label className="field">
          <span>Total rounds</span>
          <input
            min="1"
            name="totalRounds"
            onChange={handleDraftChange}
            type="number"
            value={draftSettings.totalRounds}
          />
        </label>

        <label className="field">
          <span>Round length, minutes</span>
          <input
            min="1"
            name="roundDurationMinutes"
            onChange={handleDraftChange}
            type="number"
            value={draftSettings.roundDurationMinutes}
          />
        </label>

        <label className="field">
          <span>Break every K rounds</span>
          <input
            min="1"
            name="breakEveryRounds"
            onChange={handleDraftChange}
            type="number"
            value={draftSettings.breakEveryRounds}
          />
        </label>

        <label className="field">
          <span>Break length, minutes</span>
          <input
            min="1"
            name="breakDurationMinutes"
            onChange={handleDraftChange}
            type="number"
            value={draftSettings.breakDurationMinutes}
          />
        </label>

        <label className="field">
          <span>Break label</span>
          <input
            name="breakLabel"
            onChange={handleDraftChange}
            type="text"
            value={draftSettings.breakLabel}
          />
        </label>

        <label className="checkbox-field">
          <input
            checked={draftSettings.breakAfterLastRound}
            name="breakAfterLastRound"
            onChange={handleDraftChange}
            type="checkbox"
          />
          <span>Add a break after the last round</span>
        </label>

        <label className="checkbox-field">
          <input
            checked={draftSettings.flashUnderTwoMinutes}
            name="flashUnderTwoMinutes"
            onChange={handleDraftChange}
            type="checkbox"
          />
          <span>Flash red when less than 2 minutes remain</span>
        </label>

        <button className="button button--primary button--full" type="submit">
          Apply Settings
        </button>
      </form>
    </aside>
  )
})

export default function App() {
  const [settings, setSettings] = useState(loadInitialSettings)
  const [draftSettings, setDraftSettings] = useState(() => toDraft(loadInitialSettings()))
  const [isPresentationMode, setIsPresentationMode] = useState(false)
  const phases = useMemo(() => buildPhases(settings), [settings])

  const [phaseIndex, setPhaseIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(() => phases[0]?.durationMs ?? 0)
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const deadlineRef = useRef(null)
  const phaseIndexRef = useRef(0)

  const currentPhase = phases[phaseIndex] ?? null
  const phaseDurationMs = currentPhase?.durationMs ?? 0
  const previousPhase = phaseIndex > 0 ? phases[phaseIndex - 1] : null
  const nextPhase = phaseIndex < phases.length - 1 ? phases[phaseIndex + 1] : null
  const currentRoundNumber =
    currentPhase?.type === 'round'
      ? currentPhase.roundNumber
      : Math.min(settings.totalRounds, phaseIndex + 1 - (currentPhase?.breakNumber ?? 1))

  const resetToFirstPhase = useCallback(() => {
    phaseIndexRef.current = 0
    setPhaseIndex(0)
    setRemainingMs(phases[0]?.durationMs ?? 0)
    setIsRunning(false)
    setIsComplete(false)
    deadlineRef.current = null
  }, [phases])

  useEffect(() => {
    resetToFirstPhase()
  }, [resetToFirstPhase])

  useEffect(() => {
    setDraftSettings(toDraft(settings))
  }, [settings])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    if (!currentPhase) {
      document.title = 'Tournament Timer'
      return
    }

    const title = isComplete
      ? 'Tournament Complete'
      : `${currentPhase.label} - ${formatTime(remainingMs)}`

    document.title = title
  }, [currentPhase, isComplete, remainingMs])

  const goToNextPhase = useCallback(() => {
    const nextIndex = phaseIndexRef.current + 1

    if (nextIndex >= phases.length) {
      deadlineRef.current = null
      setIsRunning(false)
      setIsComplete(true)
      setRemainingMs(0)
      return
    }

    phaseIndexRef.current = nextIndex
    setPhaseIndex(nextIndex)

    const nextDuration = phases[nextIndex].durationMs
    setRemainingMs(nextDuration)

    if (deadlineRef.current !== null) {
      deadlineRef.current = Date.now() + nextDuration
    }
  }, [phases])

  useEffect(() => {
    if (!isRunning || isComplete || !currentPhase) {
      return undefined
    }

    const tick = () => {
      if (deadlineRef.current === null) {
        return
      }

      const nextRemaining = deadlineRef.current - Date.now()

      if (nextRemaining <= 0) {
        goToNextPhase()
        return
      }

      setRemainingMs(nextRemaining)
    }

    tick()
    const timerId = window.setInterval(tick, 1000)

    return () => window.clearInterval(timerId)
  }, [currentPhase, goToNextPhase, isComplete, isRunning])

  const startTimer = () => {
    if (!currentPhase) {
      return
    }

    if (isComplete) {
      resetToFirstPhase()
      deadlineRef.current = Date.now() + (phases[0]?.durationMs ?? 0)
      setIsRunning(true)
      return
    }

    if (isRunning) {
      return
    }

    deadlineRef.current = Date.now() + remainingMs
    setIsRunning(true)
  }

  const pauseTimer = () => {
    if (!isRunning || deadlineRef.current === null) {
      return
    }

    setRemainingMs(Math.max(0, deadlineRef.current - Date.now()))
    deadlineRef.current = null
    setIsRunning(false)
  }

  const resetCurrentCycle = () => {
    resetToFirstPhase()
  }

  const skipCurrentPhase = () => {
    if (!currentPhase || isComplete) {
      return
    }

    goToNextPhase()
  }

  const adjustRemaining = (deltaMs) => {
    if (!currentPhase || isComplete) {
      return
    }

    const baseRemaining =
      isRunning && deadlineRef.current !== null
        ? deadlineRef.current - Date.now()
        : remainingMs

    const nextRemaining = Math.max(0, baseRemaining + deltaMs)

    if (isRunning && deadlineRef.current !== null) {
      deadlineRef.current = Date.now() + nextRemaining
    }

    setRemainingMs(nextRemaining)
  }

  const handleDraftChange = useCallback((event) => {
    const { name, type, value, checked } = event.target

    setDraftSettings((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }, [])

  const applySettings = useCallback((event) => {
    event.preventDefault()
    setSettings(sanitizeDraft(draftSettings))
  }, [draftSettings])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        return
      }

      await document.exitFullscreen()
    } catch {
      // Fullscreen API may be unavailable in some embedded environments.
    }
  }

  const timerClassName = [
    'timer-value',
    settings.flashUnderTwoMinutes && remainingMs > 0 && remainingMs <= 120000
      ? 'timer-value--urgent'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const primaryButtonLabel = getPrimaryButtonLabel(
    isRunning,
    isComplete,
    remainingMs,
    phaseDurationMs,
  )

  return (
    <div className="app-shell">
      <main className={`layout ${isPresentationMode ? 'layout--presentation' : ''}`}>
        <section className="timer-panel">
          <div className="stage-chip">
            {isComplete
              ? 'Tournament Complete'
              : currentPhase?.type === 'break'
                ? `${currentPhase.label}`
                : `Round ${currentRoundNumber} of ${settings.totalRounds}`}
          </div>

          <div className="timer-card">
            <div className="phase-surroundings">
              <div className="phase-side phase-side--previous">
                <span className="phase-side__caption">Previous</span>
                <span className="phase-side__label">
                  {previousPhase?.label ?? 'Start'}
                </span>
              </div>

              <div className="phase-center">
                <p className="phase-label">
                  {isComplete ? 'Tournament Complete' : currentPhase?.label ?? 'No phases'}
                </p>
                <div className={timerClassName}>{formatTime(remainingMs)}</div>
              </div>

              <div className="phase-side phase-side--next">
                <span className="phase-side__caption">Next</span>
                <span className="phase-side__label">
                  {nextPhase?.label ?? 'Finish'}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`controls-grid ${
              isPresentationMode ? 'controls-grid--presentation' : ''
            }`}
          >
            <button
              className="button button--primary"
              onClick={startTimer}
              disabled={isRunning}
              type="button"
            >
              {primaryButtonLabel}
            </button>
            <button
              className="button"
              onClick={pauseTimer}
              disabled={!isRunning}
              type="button"
            >
              Pause
            </button>
            <button className="button" onClick={() => adjustRemaining(-60000)} type="button">
              -1 min
            </button>
            <button className="button" onClick={() => adjustRemaining(-5000)} type="button">
              -5 sec
            </button>
            <button className="button" onClick={() => adjustRemaining(5000)} type="button">
              +5 sec
            </button>
            <button className="button" onClick={() => adjustRemaining(60000)} type="button">
              +1 min
            </button>
            <button className="button" onClick={skipCurrentPhase} disabled={isComplete} type="button">
              Skip
            </button>
            <button
              className="button"
              onClick={() => setIsPresentationMode((previous) => !previous)}
              type="button"
            >
              {isPresentationMode ? 'Show Settings' : 'Hall Mode'}
            </button>
            <button className="button" onClick={toggleFullscreen} type="button">
              Fullscreen
            </button>
            <button className="button button--ghost" onClick={resetCurrentCycle} type="button">
              Reset Timer
            </button>
          </div>
        </section>

        {!isPresentationMode && (
          <SettingsPanel
            applySettings={applySettings}
            draftSettings={draftSettings}
            handleDraftChange={handleDraftChange}
          />
        )}
      </main>
    </div>
  )
}
