{
  "targets": [
    {
      "target_name": "linkster_clipboard_listener",
      "sources": ["src/addon.cc"],
      "include_dirs": ["<(module_root_dir)/../../node_modules/node-addon-api"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='win'", {
          "sources": ["src/win/clipboard_win.cc"],
          "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1 } }
        }],
        [
          "OS=='mac'",
          {
            "sources": ["src/mac/clipboard_mac.mm"],
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "MACOSX_DEPLOYMENT_TARGET": "10.15"
            }
          }
        ],
        [
          "OS!='win' and OS!='mac'",
          { "sources": ["src/stub/clipboard_stub.cc"] }
        ]
      ]
    }
  ]
}
