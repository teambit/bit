node  {
    checkout([$class: 'GitSCM', branches: [[name: '*/master']], doGenerateSubmoduleConfigurations: false, extensions: [], submoduleCfg: [], userRemoteConfigs: [[credentialsId: 'b0cc61f6-f63c-44ce-b004-c7ce63415d3f', url: 'git@git.cocycles.io:core/bit.git']]])
	def releaseServer = "${env.BIT_STAGE_SERVER}"
	def assets = "${env.BIT_ASSETS}"
	print releaseServer
	def env = "${environment}"
	def app = "bit"
	def currentVersion = sh script: 'cat package.json | grep version | head -1 | awk -F: \'{ print $2 }\' | sed \'s/[",]//g\' ' , returnStdout: true
	currentVersion = currentVersion.replaceAll("\\s","")
	def bundleName = "bit_${currentVersion}"
    def uploadfolder = "gs://bit-assets/release/${currentVersion}/"
    
    stage 'remove old zip files '
    sh("rm -rf *.tar.gz  && rm -rf ./distribution  && rm -rf ./node_modules")

    stage 'Running tar'
    sh('cd ./scripts && ./build-tar.sh tar')

    stage 'Running brew'
    sh("cd ./scripts && ./build-brew.sh ")


    stage 'Running deb'
    sh('cd ./scripts && ./build-deb.sh')


    stage 'export to google storage'
    sh("gsutil -m cp -a public-read ./distribution/brew_pkg/${bundleName}_brew.tar.gz ${uploadfolder}")
    sh("gsutil -m cp -a public-read ./distribution/debian_pkg/${bundleName}_deb.deb ${uploadfolder}")


    
     stage 'notify release server'
     notifyReleaseServer(currentVersion,releaseServer+"/update")

    stage 'generate formula for brew'
    sh("cd ./scripts && ./generate-formula.sh ${assets}/${currentVersion}/${bundleName}_brew.tar.gz")
    sh("gsutil -m cp  ./scripts/bit.rb ${uploadfolder}")

}
import groovy.json.JsonOutput
def notifyReleaseServer(version,url) {
    def payload = JsonOutput.toJson([version : version,
                                 brew: "bit_${version}_brew.tar.gz",
                                 deb: "bit_${version}_deb.deb"])

    print(payload)

    def post = "curl -d '${payload.toString()}' -H 'Content-Type: application/json' ${url}"
    print ("${post}")
    sh ("${post}")
}