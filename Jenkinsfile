#!/usr/bin/env groovy

def installBuildRequirements(){
	def nodeHome = tool 'nodejs-14.19.1'
	env.PATH="${env.PATH}:${nodeHome}/bin"
	sh "npm install -g typescript"
	sh 'npm install -g "vsce"'
}

def buildVscodeExtension(){
	sh "npm install"
	sh "npm run vscode:prepublish"
}

def downloadLombokJar(){
	stage "Download lombok.jar"
	sh "npx gulp download_lombok"
}

def packageSpecificExtensions() {
	stage "Package platform specific vscode-java"
	def platforms = ["win32-x64", "linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"]
	def embeddedJRE = 17
	for(platform in platforms){
		sh "npx gulp download_jre --target ${platform} --javaVersion ${embeddedJRE}"
		if (publishPreRelease.equals('true')) {
			sh "vsce package --pre-release --target ${platform} -o java-${platform}-${env.EXTENSION_VERSION}-${env.BUILD_NUMBER}.vsix"
		} else {
			sh "vsce package --target ${platform} -o java-${platform}-${env.EXTENSION_VERSION}-${env.BUILD_NUMBER}.vsix"
		}
	}
}

def packageExtensions() {
	if (publishPreRelease.equals('true')) {
		// for pre-release versions we only package platform specific extensions
		stage "replace extension version"
		sh "npx gulp prepare_pre_release"

		def packageJson = readJSON file: 'package.json'
		env.EXTENSION_VERSION = "${packageJson.version}"

		packageSpecificExtensions()
	} else {
		stage "package generic version"
		def packageJson = readJSON file: 'package.json'
		env.EXTENSION_VERSION = "${packageJson.version}"

		sh "vsce package -o java-${env.EXTENSION_VERSION}-${env.BUILD_NUMBER}.vsix"

		def vsix = findFiles(glob: '**.vsix')
		stash name:'vsix', includes:vsix[0].path

		packageSpecificExtensions()
		stash name:'platformVsix', includes:'java-win32-*.vsix,java-linux-*.vsix,java-darwin-*.vsix'

		stage 'Upload vscode-java to staging'
		def artifactDir = "java-${env.EXTENSION_VERSION}-${env.BUILD_NUMBER}"
		sh "mkdir ${artifactDir}"
		sh "mv *.vsix ${artifactDir}"

		sh "sftp ${UPLOAD_LOCATION}/jdt.ls/staging <<< \$'mkdir ${artifactDir}\nput -r ${artifactDir}'"
		// Clean up build vsix
		sh "rm -rf ${artifactDir}"
	}
}

def publishExtensions() {
	if (publishPreRelease.equals('true')) {
		stage "publish generic version"
		withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_java_marketplace', variable: 'TOKEN']]) {
			// Clean up embedded jre folder from previous build
			sh 'npx gulp clean_jre'
			// Publish a generic version
			sh 'vsce publish --pre-release -p ${TOKEN} --target win32-ia32 win32-arm64 linux-armhf alpine-x64 alpine-arm64'
		}

		stage "publish specific version"

		def platformVsixes = findFiles(glob: '**.vsix')

		// for pre-release versions, vsixs are not stashed and kept in project folder

		// VS Code Marketplace
		withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_java_marketplace', variable: 'TOKEN']]) {
			for(platformVsix in platformVsixes){
				sh 'vsce publish -p ${TOKEN}' + " --packagePath ${platformVsix.path}"
			}
		}

		// Open VSX Marketplace
		sh 'npm install -g "ovsx"'
		withCredentials([[$class: 'StringBinding', credentialsId: 'open-vsx-access-token', variable: 'OVSX_TOKEN']]) {
			for(platformVsix in platformVsixes){
				sh 'ovsx publish -p ${OVSX_TOKEN}' + " --packagePath ${platformVsix.path}"
			}
		}
	} else if (publishToMarketPlace.equals('true')) {
		timeout(time:5, unit:'DAYS') {
			input message:'Approve deployment?', submitter: 'fbricon,rgrunber'
		}

		def platformVsixes = findFiles(glob: '**.vsix', excludes: vsix[0].path)

		stage "Publish to VS Code Marketplace"
		// VS Code Marketplace
		withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_java_marketplace', variable: 'TOKEN']]) {
			// Clean up embedded jre folder from previous build
			sh 'npx gulp clean_jre'
			// Publish a generic version
			sh 'vsce publish -p ${TOKEN} --target win32-ia32 win32-arm64 linux-armhf alpine-x64 alpine-arm64'

			// Publish platform specific versions
			unstash 'platformVsix'
			for(platformVsix in platformVsixes){
				sh 'vsce publish -p ${TOKEN}' + " --packagePath ${platformVsix.path}"
			}
		}

		// Open VSX Marketplace
		stage "Publish to Open VSX Marketplace"
		sh 'npm install -g "ovsx"'
		withCredentials([[$class: 'StringBinding', credentialsId: 'open-vsx-access-token', variable: 'OVSX_TOKEN']]) {
			// Publish a generic version
			sh 'ovsx publish -p ${OVSX_TOKEN} --target win32-ia32 win32-arm64 linux-armhf alpine-x64 alpine-arm64'
			for(platformVsix in platformVsixes){
				sh 'ovsx publish -p ${OVSX_TOKEN}' + " --packagePath ${platformVsix.path}"
			}
		}

		stage "Publish to http://download.jboss.org/jbosstools/static/jdt.ls/stable/"
		def artifactDir = "java-${env.EXTENSION_VERSION}"
		sh "mkdir ${artifactDir}"
		sh "mv *.vsix ${artifactDir}"

		archive includes:"${artifactDir}/**/*.*"

		// copy this stable build to Akamai-mirrored /static/ URL, so staging can be cleaned out more easily
		sh "sftp ${UPLOAD_LOCATION}/static/jdt.ls/stable/ <<< \$'mkdir ${artifactDir}\nput -r ${artifactDir}'"
	}
}

node('rhel8'){
	stage 'Build JDT LS'

	env.JAVA_HOME="${tool 'openjdk-17'}"
	env.PATH="${env.JAVA_HOME}/bin:${env.PATH}"
	sh 'java -version'

	git url: 'https://github.com/eclipse/eclipse.jdt.ls.git'
	sh "./mvnw clean verify -B -U -e -Pserver-distro -Dtycho.disableP2Mirrors=true -DskipTests -P!jboss-maven-repos,!redhat-ga-repository,!redhat-ea-repository"

	def files = findFiles(glob: '**/org.eclipse.jdt.ls.product/distro/**.tar.gz')
	stash name: 'server_distro', includes :files[0].path
}

node('rhel8'){
	env.JAVA_HOME="${tool 'openjdk-17'}"
	env.PATH="${env.JAVA_HOME}/bin:${env.PATH}"
	stage 'Checkout vscode-java code'
	deleteDir()
	git url: 'https://github.com/redhat-developer/vscode-java.git'

	stage 'install vscode-java build requirements'
	installBuildRequirements()

	stage 'Build vscode-java'
	buildVscodeExtension()
	unstash 'server_distro'
	def files = findFiles(glob: '**/org.eclipse.jdt.ls.product/distro/**.tar.gz')
	sh "rm -rf ./out"
	sh "mkdir ./server"
	sh "tar -xvzf ${files[0].path} -C ./server"

	stage 'Test vscode-java for staging'
	wrap([$class: 'Xvnc']) {
		sh "npm run compile" //compile the test code too
		env.SKIP_COMMANDS_TEST="true"
		sh "npm test --silent"
	}

	downloadLombokJar()

	packageExtensions()

	publishExtensions()
}
