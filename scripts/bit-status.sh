STATUS=`bit status`
echo $STATUS

if [[ "$STATUS" =~ "issues found" || $? -ne 0 ]]; then
   echo "bit status found errors"
   exit 1
else
   echo "bit status is fine!"
   exit 0
fi