# Calendar UX/Performance Issues

## Current State
The calendar interaction is "clunky" and relies heavily on server-side revalidation, causing full re-renders and visible lag.

## Reported Issues

### 1. Start Task Latency
- **User Action**: Press "Start" button.
- **Observed Behavior**: 
    - No immediate feedback.
    - Whole calendar goes into a loading/rendering state.
    - After a few seconds, the timer finally appears.
- **Root Cause**: The action calls a Server Action which performs a DB insert/update and then triggers `revalidatePath('/calendar')`. The UI waits for this entire roundtrip and the subsequent page reload before showing the active state.

### 2. Stop/Pause Latency
- **User Action**: Press "Pause" or "Complete".
- **Observed Behavior**:
    - Timer continues counting for a few seconds (UI doesn't freeze or acknowledge click immediately).
    - Whole calendar re-renders.
    - State finally updates to Stopped/Paused.
- **Root Cause**: Similar to start, lack of Optimistic UI. The local timer state isn't paused immediately upon click; it waits for the server to confirm the status change.

## Recommended Fixes (Future Work)

### 1. Implement Optimistic UI
- **Goal**: Immediate visual feedback.
- **Strategy**: 
    - When "Start" is clicked, immediately set the local state to "Running" and start a local timer, *before* the server request finishes.
    - When "Pause" is clicked, immediately stop the local timer and update the icon.
    - Use React's `useOptimistic` hook or local state management to handle this.

### 2. Reduce Revalidation Scope
- **Goal**: Prevent the "whole calendar re-rendering" effect.
- **Strategy**: 
    - Instead of revalidating the entire page (`revalidatePath`), return the updated task data from the Server Action.
    - Update only the specific `TimeBlock` component with the new data.
    - Use Client Components to manage the active task state separately from the heavy Calendar Grid.

### 3. Loading States
- **Goal**: Better feedback during server operations.
- **Strategy**:
    - Show a small spinner on the button itself (not a full page loader) while the background sync happens, if optimistic updates aren't possible for some reason.
