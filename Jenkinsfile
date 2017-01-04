import java.text.SimpleDateFormat
node  {
    properties([[$class: 'ParametersDefinitionProperty', parameterDefinitions: [[$class: 'ChoiceParameterDefinition', choices: 'stage\nproduction', description: '', name: 'environment']]]])

    checkout scm
	def env = "${environment}"
	def app = "bit"
	def currentVersion = sh script: 'cat package.json | grep version | head -1 | awk -F: \'{ print $2 }\' | sed \'s/[",]//g\' ' , returnStdout: true
	currentVersion = currentVersion.replaceAll("\\s","")
	def bundleName="bit_${currentVersion}"
    def uploadfolder = "gs://bit-assets/release/${currentVersion}/"
    def releaseServer = "${env.BIT_STAGE_SERVER}"

    stage 'remove old zip files '
    sh("rm -rf *.tar.gz  && rm -rf ./distribution")

    stage 'Running tar'
    sh('cd ./scripts && ./build-tar.sh tar')

    stage 'Running brew'
    sh('cd ./scripts && ./build-brew.sh')

    stage 'Running deb'
    sh('cd ./scripts && ./build-deb.sh')


    stage 'export to google storage'
    sh("gsutil -m cp -a public-read ./distribution/brew_pkg/${bundleName}_brew.tar.gz ${uploadfolder}")
    sh("gsutil -m cp -a public-read ./distribution/debian_pkg/${bundleName}_deb.deb ${uploadfolder}")

    stage 'notify release server'
     notifyReleaseServer(currentVersion,releaseServer)
}

import groovy.json.JsonBuilder

def notifyReleaseServer(version,url) {
    def json = new JsonBuilder()
    def payload = json {
            version version
            brew: "bit_${version}_brew.tar.gz"
            deb: "bit_${version}_deb.deb"
    }

    print(json)

    def post = "curl -d '${json.toString()}' -H 'Content-Type: application/json' ${url}"
    print ("${post}")
    sh ("${post}")
}