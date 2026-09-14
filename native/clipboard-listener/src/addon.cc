#include <napi.h>

#include <atomic>
#include <string>

#include "clipboard_listener.h"

static Napi::ThreadSafeFunction g_tsfn;
static std::atomic<bool> g_running{false};

static void CallJs(Napi::Env env, Napi::Function callback, std::string* text) {
  if (env != nullptr && callback != nullptr && text != nullptr) {
    callback.Call({Napi::String::New(env, *text)});
  }
  delete text;
}

static Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "a callback function is required")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (g_running.load()) {
    return Napi::Boolean::New(env, true);
  }

  g_tsfn = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(),
                                         "LinksterClipboard", 0, 1);

  if (!linkster::StartClipboardListener(g_tsfn)) {
    g_tsfn.Release();
    Napi::Error::New(env, "failed to start clipboard listener")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_running.store(true);
  return Napi::Boolean::New(env, true);
}

static Napi::Value Stop(const Napi::CallbackInfo& info) {
  if (g_running.exchange(false)) {
    linkster::StopClipboardListener();
    g_tsfn.Release();
  }
  return info.Env().Undefined();
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}

NODE_API_MODULE(linkster_clipboard_listener, Init)

namespace linkster {

void EmitClipboardText(const std::string& text) {
  if (!g_running.load()) return;
  std::string* payload = new std::string(text);
  napi_status status = g_tsfn.NonBlockingCall(payload, CallJs);
  if (status != napi_ok) {
    delete payload;
  }
}

}  // namespace linkster
