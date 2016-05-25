redis_password = ""
redis_port = ""
digital_ocean_token = ""

Vagrant.configure(2) do |config|
  config.vm.box = "digital_ocean"
  config.vm.box_url = "https://github.com/smdahlen/vagrant-digitalocean/raw/master/box/digital_ocean.box"
  config.vm.synced_folder ".", "/vagrant", disabled: true

  config.vm.define "test" do |node|
    node.vm.provision "shell", inline: <<-SHELL
      sudo apt-get update
      sudo apt-get install -y python gcc make g++ git build-essential tcl8.5
      sudo apt-get install -y wget htop screen nano

      wget --quiet https://nodejs.org/dist/v4.4.5/node-v4.4.5-linux-x64.tar.gz
      tar -C /usr/local -zxf node-v4.4.5-linux-x64.tar.gz --strip 1

      wget --quiet http://download.redis.io/releases/redis-stable.tar.gz
      tar xzf redis-stable.tar.gz
      cd redis-stable
      make
      sudo make install

      screen -X -S redis quit
      echo 'bind 127.0.0.1' >> ./redis.conf
      echo 'port #{redis_port}' >> ./redis.conf
      echo 'requirepass #{redis_password}' >> ./redis.conf
      nohup screen -S redis -d -m redis-server ./redis.conf

      screen -X -S webrtc quit
      sudo npm install -g libp2p-webrtc-star
      nohup screen -S webrtc -d -m star-sig

      screen -X -S server quit
      sudo rm -rf /orbit-server
      sudo mkdir /orbit-server
      cd /orbit-server
      git clone https://github.com/haadcode/orbit-server.git
      cd orbit-server
      npm install --production
      export REDIS_PASSWORD=#{redis_password}
      export REDIS_PORT=#{redis_port}
      nohup screen -S server -d -m npm start

    SHELL

    node.vm.provider :digital_ocean do |provider, override|
      override.ssh.private_key_path = "~/.ssh/digital-ocean"
      override.vm.box               = "digital_ocean"
      override.vm.box_url           = "https://github.com/smdahlen/vagrant-digitalocean/raw/master/box/digital_ocean.box"
      provider.token                = digital_ocean_token
      provider.image                = "ubuntu-14-04-x64"
      provider.region               = "AMS3"
      provider.size                 = "512mb"
    end
  end

end
