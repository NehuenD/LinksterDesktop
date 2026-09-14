#include "../clipboard_listener.h"

namespace linkster {

// Linux (X11/Wayland) has no portable global clipboard-change notification
// without shelling out to GTK/XFixes. Returning false makes the JS factory
// fall back to the polling watcher.
bool StartClipboardListener(Napi::ThreadSafeFunction tsfn) {
  (void)tsfn;
  return false;
}

void StopClipboardListener() {}

}  // namespace linkster
