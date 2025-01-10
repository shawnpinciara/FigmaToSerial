#!/bin/sh
cd /c %~dp0
git add .
git commit -am "Updates"
git push
echo Press Enter...
read