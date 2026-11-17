package com.alfiandi.alshare;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

public class NetworkUtils {

    public static List<String> getLocalIpAddresses() {
        List<String> ips = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp()) continue;

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        String host = addr.getHostAddress();
                        if (host != null && !host.startsWith("127.")) {
                            // Prioritize WLAN / Wi-Fi interfaces
                            String name = iface.getName().toLowerCase();
                            if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("eth")) {
                                ips.add(0, host);
                            } else {
                                ips.add(host);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }

        if (ips.isEmpty()) {
            ips.add("127.0.0.1");
        }
        return ips;
    }

    public static String getPrimaryIp() {
        List<String> ips = getLocalIpAddresses();
        return ips.isEmpty() ? "127.0.0.1" : ips.get(0);
    }
}
