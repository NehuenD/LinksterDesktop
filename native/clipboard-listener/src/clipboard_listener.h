#pragma once

#include <napi.h>

#include <string>

namespace linkster {

// Starts the platform clipboard listener. Returns false if unsupported.
bool StartClipboardListener(Napi::ThreadSafeFunction tsfn);

// Stops the listener and releases platform resources.
void StopClipboardListener();

// Invoked by platform code on the worker thread to deliver new clipboard text.
void EmitClipboardText(const std::string& text);

}  // namespace linkster
