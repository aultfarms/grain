# Feed App
----------

This app enters feed delivery loads in Trello.

## Testing:
-----------
To test on Android, install command line tools:
(http://johnborg.es/2019/04/android-setup-macos.html)

Specifically, the packages to pass to sdkmanager are:
```bash
sdkmanager "build-tools;34.0.0" "platform-tools" "emulator" "system-images;android-34;google_apis_playstore;x86_64" "platforms;android-34"
```

Then you need that same system-images name when you run `avdmanager` to create the emulator image:
```
avdmanager create avd -n "Pixel_6" -d "pixel_6" -k "system-images;android-34;google_apis_playstore;x86_64"
```

Finally, the "emulator" is not present in the path after `sdkmanager` installs it.  Run it from absolute path:
```
/usr/local/share/android-commandlinetools/emulator/emulator -avd Pixel_6
```