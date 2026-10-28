# Reviewed local game packages

`masonf539-loaded-roulette-0.1.0.tgz` is the private basic roulette prototype
built from the sibling Loaded-Roulette repository. It includes no node_modules,
tests, credentials, or work-directory files. GameHub installs it through its
locked file dependency, including in both Docker stages. It is not an npm
publication or the complete planned card/shop/loan game.

After changing the source, run its checks/build and pack it here, reinstall the
file dependency in GameHub to refresh its locked integrity, and run
`npm run verify:packages`. Do not edit the archive or installed package by hand.
Replace the file dependency with an exact registry version when intentionally
publishing the game later.
